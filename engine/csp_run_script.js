// Linked in by tools/build-engine.sh (--js-library), after Emscripten's own libraries, so these
// replace the stock emscripten_run_script / emscripten_run_script_string from libcore.js.
//
// The stock versions eval() the string the engine passes. The page that hosts this build runs
// under a Content-Security-Policy without 'unsafe-eval', where eval() throws and the engine
// freezes. So the string goes to Module.runScript instead, which index.html defines; it acts on
// the few fixed strings eduke32-wasm sends (its menu state for window.__e32menu, and calls into
// the online-play layer that this build leaves out). Otherwise the same as Emscripten 6.0.5's.

addToLibrary({
  emscripten_run_script: (ptr) => {
    Module['runScript'](UTF8ToString(ptr));
  },

  emscripten_run_script_string__noleakcheck: true,
  emscripten_run_script_string__deps: ['$lengthBytesUTF8', '$stringToUTF8', 'realloc'],
  emscripten_run_script_string: (ptr) => {
    var s = Module['runScript'](UTF8ToString(ptr));
    if (s == null) {
      return 0;
    }
    s += '';
    var me = _emscripten_run_script_string;
    me.bufferSize = lengthBytesUTF8(s) + 1;
    me.buffer = _realloc(me.buffer ?? 0, me.bufferSize);
    stringToUTF8(s, me.buffer, me.bufferSize);
    return me.buffer;
  },
});
