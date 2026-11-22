(function () {
    var LIGHT_COLOR = '#fafaf9';
    var scriptEl = document.currentScript;
    var scriptSrc = scriptEl ? (scriptEl.getAttribute('src') || '') : '';
    var isSimPage = scriptSrc
        ? scriptSrc.indexOf('../') === 0
        : /(?:^|\/)simulacoes\/(?!index\.html?$).+\.html?$/i.test(window.location.pathname || '');
    var DARK_COLOR = isSimPage ? '#1c1917' : '#161412';
    var meta = document.querySelector('meta[name="theme-color"]');
    try {
        var saved = localStorage.getItem('sim_theme');
        if (saved === 'light') {
            document.documentElement.dataset.theme = 'light';
            if (meta) meta.setAttribute('content', LIGHT_COLOR);
        } else {
            document.documentElement.dataset.theme = 'dark';
            if (meta) meta.setAttribute('content', DARK_COLOR);
        }
    } catch (e) {
        document.documentElement.dataset.theme = 'dark';
        if (meta) meta.setAttribute('content', DARK_COLOR);
    }
})();
