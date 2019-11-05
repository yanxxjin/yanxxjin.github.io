var OriginTitile = document.title;
var titleTime;
document.addEventListener('visibilitychange', function() {
    if (document.hidden) {
        document.title = 'Hello?';
        clearTimeout(titleTime);
    }
    else {
        document.title = '○（＊￣︶￣＊）○';
        titleTime = setTimeout(function() {
            document.title = OriginTitile;
        }, 2000);
    }
});
