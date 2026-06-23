// 카카오맵 SDK 로드 + 장소 검색 + 지도 렌더를 담당하는 모듈.
// 국회의사당(여의도) 기준으로 가장 가까운 장소를 선택한다.

const ASSEMBLY = { lat: 37.5318, lng: 126.9143 }; // 국회의사당

// 새 탭으로 열림을 나타내는 외부 링크 아이콘 (Lucide external-link)
const EXTERNAL_LINK_ICON =
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" ' +
  'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M15 3h6v6"/><path d="M10 14 21 3"/>' +
  '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h6"/></svg>';

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
      radius: 1000, // 국회의사당 1km 반경으로 한정 (먼 동명이 지역 결과 제외)
      sort: window.kakao.maps.services.SortBy.DISTANCE,
      // 카테고리 코드로 한정하지 않는다. 음식점·카페·주점 등은 모두
      // category_group_code가 채워져 있고, 순수 지명/행정구역(예: 가양동)만
      // 비어 있으므로 "코드가 있는 결과"만 골라 지명을 제외한다.
    };
    places.keywordSearch(
      name,
      (data, status) => {
        if (status === window.kakao.maps.services.Status.OK && data.length > 0) {
          // 가장 가까운 순으로 정렬돼 있으므로, 그중 실제 장소
          // (category_group_code가 있는 것)의 첫 결과를 고른다.
          const place = data.find((d) => d.category_group_code) || data[0];
          resolve(place);
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
  link.setAttribute('aria-label', '카카오맵에서 열기 (새 탭)');
  link.innerHTML = `<span>카카오맵에서 열기</span>${EXTERNAL_LINK_ICON}`;
  container.appendChild(link);

  // 컨테이너가 늦게 보이면 지도 타일이 깨지므로 한 번 리레이아웃
  setTimeout(() => {
    map.relayout();
    map.setCenter(center);
  }, 0);
}
