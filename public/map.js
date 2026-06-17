// 카카오맵 SDK 로드 + 장소 검색 + 지도 렌더를 담당하는 모듈.
// 국회의사당(여의도) 기준으로 가장 가까운 장소를 선택한다.

const ASSEMBLY = { lat: 37.5318, lng: 126.9143 }; // 국회의사당

let cachedKey = null;        // string | null (null = 미설정)
let configLoaded = false;
let sdkPromise = null;       // Promise<boolean> 캐시

export async function initConfig() {
  if (configLoaded) return cachedKey;
  try {
    const res = await fetch('/api/config');
    const data = await res.json();
    cachedKey = data.kakaoJsKey || null;
  } catch {
    cachedKey = null;
  }
  configLoaded = true;
  return cachedKey;
}

export function isLocationEnabled() {
  return !!cachedKey;
}

export function kakaoSearchUrl(name) {
  return `https://map.kakao.com/?q=${encodeURIComponent(name)}`;
}

export function loadKakao() {
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve) => {
    if (!cachedKey) {
      resolve(false);
      return;
    }
    if (window.kakao && window.kakao.maps) {
      resolve(true);
      return;
    }
    const script = document.createElement('script');
    script.src =
      `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${cachedKey}` +
      `&libraries=services&autoload=false`;
    script.onload = () => window.kakao.maps.load(() => resolve(true));
    script.onerror = (e) => {
      // 진단용: SDK 로드 실패 원인 노출. 카카오가 에러 JSON을 주면 브라우저 ORB가
      // 차단해(ERR_BLOCKED_BY_ORB) Network 응답 본문이 안 보이므로 여기서 안내한다.
      console.error(
        '[map] 카카오 SDK 로드 실패. 카카오 개발자 콘솔에서 (1) 제품 설정 → 카카오맵 ' +
          '서비스가 활성화됐는지, (2) 플랫폼 Web 도메인에 현재 출처' +
          `(${window.location.origin})가 등록됐는지, (3) JavaScript 키가 맞는지 확인하세요. ` +
          '원인은 sdk.js URL을 새 탭 주소창에 직접 열면 카카오 에러 메시지로 확인할 수 있습니다.',
        e,
      );
      resolve(false);
    };
    document.head.appendChild(script);
  });
  return sdkPromise;
}

export function findPlace(name) {
  return new Promise((resolve) => {
    const places = new window.kakao.maps.services.Places();
    const options = {
      location: new window.kakao.maps.LatLng(ASSEMBLY.lat, ASSEMBLY.lng),
      sort: window.kakao.maps.services.SortBy.DISTANCE,
    };
    places.keywordSearch(
      name,
      (data, status) => {
        if (status === window.kakao.maps.services.Status.OK && data.length > 0) {
          resolve(data[0]); // 국회의사당에서 가장 가까운 결과
        } else {
          resolve(null);
        }
      },
      options,
    );
  });
}

export function showMap(container, place) {
  const lat = Number(place.y);
  const lng = Number(place.x);
  const center = new window.kakao.maps.LatLng(lat, lng);

  container.innerHTML = '';
  const mapEl = document.createElement('div');
  mapEl.className = 'map-canvas';
  container.appendChild(mapEl);

  const map = new window.kakao.maps.Map(mapEl, { center, level: 3 });
  const marker = new window.kakao.maps.Marker({ position: center });
  marker.setMap(map);

  const link = document.createElement('a');
  link.className = 'map-link';
  link.href = place.place_url || kakaoSearchUrl(place.place_name || '');
  link.target = '_blank';
  link.rel = 'noopener';
  link.textContent = '카카오맵에서 열기';
  container.appendChild(link);

  // 컨테이너가 늦게 보이면 지도 타일이 깨지므로 한 번 리레이아웃
  setTimeout(() => {
    map.relayout();
    map.setCenter(center);
  }, 0);
}
