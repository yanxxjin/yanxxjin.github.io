var OriginTitile = document.title;
var titleTime;
document.addEventListener('visibilitychange', function() {
    if (document.hidden) {
        document.title = 'hello?';
        clearTimeout(titleTime);
    }
    else {
        document.title = '(*´∇｀*)'  + OriginTitile;
        titleTime = setTimeout(function() {
            document.title = OriginTitile;
        }, 2000);
    }
});
