(function () {
    try {
        var saved = localStorage.getItem('sim_theme');
        if (saved === 'light') {
            document.documentElement.dataset.theme = 'light';
            var meta = document.querySelector('meta[name="theme-color"]');
            if (meta) meta.setAttribute('content', '#ffffff');
        } else {
            document.documentElement.dataset.theme = 'dark';
        }
    } catch (e) {
        document.documentElement.dataset.theme = 'dark';
    }
})();
