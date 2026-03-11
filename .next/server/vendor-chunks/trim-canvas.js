/*
 * ATTENTION: An "eval-source-map" devtool has been used.
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file with attached SourceMaps in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https://webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https://webpack.js.org/configuration/mode/).
 */
exports.id = "vendor-chunks/trim-canvas";
exports.ids = ["vendor-chunks/trim-canvas"];
exports.modules = {

/***/ "(ssr)/./node_modules/trim-canvas/build/index.js":
/*!*************************************************!*\
  !*** ./node_modules/trim-canvas/build/index.js ***!
  \*************************************************/
/***/ (function(module) {

eval("!function(e,t){ true?module.exports=t():0}(this,function(){return function(e){function t(n){if(r[n])return r[n].exports;var o=r[n]={exports:{},id:n,loaded:!1};return e[n].call(o.exports,o,o.exports,t),o.loaded=!0,o.exports}var r={};return t.m=e,t.c=r,t.p=\"\",t(0)}([function(e,t){\"use strict\";function r(e){var t=e.getContext(\"2d\"),r=e.width,n=e.height,o=t.getImageData(0,0,r,n).data,f=a(!0,r,n,o),i=a(!1,r,n,o),c=u(!0,r,n,o),d=u(!1,r,n,o),p=d-c+1,l=i-f+1,s=t.getImageData(c,f,p,l);return e.width=p,e.height=l,t.clearRect(0,0,p,l),t.putImageData(s,0,0),e}function n(e,t,r,n){return{red:n[4*(r*t+e)],green:n[4*(r*t+e)+1],blue:n[4*(r*t+e)+2],alpha:n[4*(r*t+e)+3]}}function o(e,t,r,o){return n(e,t,r,o).alpha}function a(e,t,r,n){for(var a=e?1:-1,u=e?0:r-1,f=u;e?f<r:f>-1;f+=a)for(var i=0;i<t;i++)if(o(i,f,t,n))return f;return null}function u(e,t,r,n){for(var a=e?1:-1,u=e?0:t-1,f=u;e?f<t:f>-1;f+=a)for(var i=0;i<r;i++)if(o(f,i,t,n))return f;return null}Object.defineProperty(t,\"__esModule\",{value:!0}),t.default=r}])});//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKHNzcikvLi9ub2RlX21vZHVsZXMvdHJpbS1jYW52YXMvYnVpbGQvaW5kZXguanMiLCJtYXBwaW5ncyI6IkFBQUEsZUFBZSxLQUFpRCxvQkFBb0IsQ0FBbUgsQ0FBQyxpQkFBaUIsbUJBQW1CLGNBQWMsNEJBQTRCLFlBQVksVUFBVSxpQkFBaUIsZ0VBQWdFLFNBQVMsK0JBQStCLGdCQUFnQixhQUFhLGNBQWMsK0tBQStLLHlFQUF5RSxvQkFBb0IsT0FBTyxnRkFBZ0Ysb0JBQW9CLHdCQUF3QixvQkFBb0IsK0JBQStCLFdBQVcsaUJBQWlCLElBQUksMkJBQTJCLFlBQVksb0JBQW9CLCtCQUErQixXQUFXLGlCQUFpQixJQUFJLDJCQUEyQixZQUFZLHNDQUFzQyxTQUFTLGNBQWMsR0FBRyIsInNvdXJjZXMiOlsid2VicGFjazovL3NlcnZpY2Utbm90ZXMtYXBwLy4vbm9kZV9tb2R1bGVzL3RyaW0tY2FudmFzL2J1aWxkL2luZGV4LmpzPzcwMDkiXSwic291cmNlc0NvbnRlbnQiOlsiIWZ1bmN0aW9uKGUsdCl7XCJvYmplY3RcIj09dHlwZW9mIGV4cG9ydHMmJlwib2JqZWN0XCI9PXR5cGVvZiBtb2R1bGU/bW9kdWxlLmV4cG9ydHM9dCgpOlwiZnVuY3Rpb25cIj09dHlwZW9mIGRlZmluZSYmZGVmaW5lLmFtZD9kZWZpbmUoW10sdCk6XCJvYmplY3RcIj09dHlwZW9mIGV4cG9ydHM/ZXhwb3J0cy50cmltQ2FudmFzPXQoKTplLnRyaW1DYW52YXM9dCgpfSh0aGlzLGZ1bmN0aW9uKCl7cmV0dXJuIGZ1bmN0aW9uKGUpe2Z1bmN0aW9uIHQobil7aWYocltuXSlyZXR1cm4gcltuXS5leHBvcnRzO3ZhciBvPXJbbl09e2V4cG9ydHM6e30saWQ6bixsb2FkZWQ6ITF9O3JldHVybiBlW25dLmNhbGwoby5leHBvcnRzLG8sby5leHBvcnRzLHQpLG8ubG9hZGVkPSEwLG8uZXhwb3J0c312YXIgcj17fTtyZXR1cm4gdC5tPWUsdC5jPXIsdC5wPVwiXCIsdCgwKX0oW2Z1bmN0aW9uKGUsdCl7XCJ1c2Ugc3RyaWN0XCI7ZnVuY3Rpb24gcihlKXt2YXIgdD1lLmdldENvbnRleHQoXCIyZFwiKSxyPWUud2lkdGgsbj1lLmhlaWdodCxvPXQuZ2V0SW1hZ2VEYXRhKDAsMCxyLG4pLmRhdGEsZj1hKCEwLHIsbixvKSxpPWEoITEscixuLG8pLGM9dSghMCxyLG4sbyksZD11KCExLHIsbixvKSxwPWQtYysxLGw9aS1mKzEscz10LmdldEltYWdlRGF0YShjLGYscCxsKTtyZXR1cm4gZS53aWR0aD1wLGUuaGVpZ2h0PWwsdC5jbGVhclJlY3QoMCwwLHAsbCksdC5wdXRJbWFnZURhdGEocywwLDApLGV9ZnVuY3Rpb24gbihlLHQscixuKXtyZXR1cm57cmVkOm5bNCoocip0K2UpXSxncmVlbjpuWzQqKHIqdCtlKSsxXSxibHVlOm5bNCoocip0K2UpKzJdLGFscGhhOm5bNCoocip0K2UpKzNdfX1mdW5jdGlvbiBvKGUsdCxyLG8pe3JldHVybiBuKGUsdCxyLG8pLmFscGhhfWZ1bmN0aW9uIGEoZSx0LHIsbil7Zm9yKHZhciBhPWU/MTotMSx1PWU/MDpyLTEsZj11O2U/ZjxyOmY+LTE7Zis9YSlmb3IodmFyIGk9MDtpPHQ7aSsrKWlmKG8oaSxmLHQsbikpcmV0dXJuIGY7cmV0dXJuIG51bGx9ZnVuY3Rpb24gdShlLHQscixuKXtmb3IodmFyIGE9ZT8xOi0xLHU9ZT8wOnQtMSxmPXU7ZT9mPHQ6Zj4tMTtmKz1hKWZvcih2YXIgaT0wO2k8cjtpKyspaWYobyhmLGksdCxuKSlyZXR1cm4gZjtyZXR1cm4gbnVsbH1PYmplY3QuZGVmaW5lUHJvcGVydHkodCxcIl9fZXNNb2R1bGVcIix7dmFsdWU6ITB9KSx0LmRlZmF1bHQ9cn1dKX0pOyJdLCJuYW1lcyI6W10sInNvdXJjZVJvb3QiOiIifQ==\n//# sourceURL=webpack-internal:///(ssr)/./node_modules/trim-canvas/build/index.js\n");

/***/ })

};
;