(_ => {
    if(!_.dat) return;
    if(_.hasSetupDebugger) return;
    _.hasSetupDebugger = true;
    
    var gui = new dat.GUI();
    var currentGame = Game.currentGame;

    var Helper = {
        toHiRes() {
            currentGame.setResolutionScale(devicePixelRatio);
        },
        toOverRes() {
            currentGame.setResolutionScale(devicePixelRatio * 2);
        },
        toLowRes() {
            currentGame.setResolutionScale(1);
        },
        toAfricaRes() {
            currentGame.setResolutionScale(devicePixelRatio * 0.5);
        },
        to2X_AfricaRes() {
            currentGame.setResolutionScale(devicePixelRatio * 0.25);
        },

        daycore() {
            currentGame.setPlaybackRate(1 / 1.15);
        },
        nightcore() {
            currentGame.setPlaybackRate(1.15);
        }
    };

    var appearance = gui.addFolder("外觀設定");
    appearance.add(currentGame, "maxFPS", 1, 300).listen();
    appearance.add(Helper, "toOverRes");
    appearance.add(Helper, "toHiRes").name("高畫質模式");
    appearance.add(Helper, "toLowRes").name("一般畫質模式");
    appearance.add(Helper, "toAfricaRes");
    appearance.add(Helper, "to2X_AfricaRes");

    var debug = gui.addFolder("除錯設定");
    debug.add(currentGame, "enableDebugLog").name("啟用紀錄").listen();
    debug.add(currentGame, "debugLogCount", 1, 30).name("顯示紀錄個數").listen();

    var exclusive = gui.addFolder("進階彩蛋");
    exclusive.add(Helper, "daycore");
    exclusive.add(Helper, "nightcore");
})(window);
