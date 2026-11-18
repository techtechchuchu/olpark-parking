// Unity -> 웹페이지 알림.
mergeInto(LibraryManager.library, {
  // 주차장 클릭, 준비 완료: 같은 주소(origin)의 부모 창에만 보낸다
  OlparkLotClicked: function (osmPtr) {
    try {
      window.parent.postMessage({ type: "olpark-lot-click", osm: UTF8ToString(osmPtr) }, window.location.origin);
    } catch (e) {}
  },
  OlparkReady: function () {
    try {
      window.parent.postMessage({ type: "olpark-ready" }, window.location.origin);
    } catch (e) {}
  },
  // 이름표 위치: 같은 문서(unity/index.html)의 함수가 HTML로 그린다
  OlparkLabels: function (linesPtr) {
    if (typeof window.olparkLabels === "function") window.olparkLabels(UTF8ToString(linesPtr));
  }
});
