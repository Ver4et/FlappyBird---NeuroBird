(function(){
    var statsAlive = null;
    var statsGeneration = null;
    var statsPopulation = null;
    var populationInput = null;
    var survivorsInput = null;
    var mutationInput = null;
    var startButton = null;

    function clampInt(value, min, max) {
        value = parseInt(value, 10);
        if (Number.isNaN(value)) return min;
        return Math.min(Math.max(value, min), max);
    }

    function clampFloat(value, min, max) {
        value = parseFloat(value);
        if (Number.isNaN(value)) return min;
        return Math.min(Math.max(value, min), max);
    }

    function updateStats() {
        if (!window.game_manager || !window.game_manager.generation) {
            return;
        }

        var generation = window.game_manager.generation.gen_num || 0;
        var alive = 0;
        if (Array.isArray(window.game_manager.generation.population)) {
            alive = window.game_manager.generation.population.filter(function(bird){
                return bird && bird.isAlive;
            }).length;
        }

        if (statsAlive) statsAlive.textContent = alive.toString();
        if (statsGeneration) statsGeneration.textContent = generation.toString();
        if (statsPopulation) statsPopulation.textContent = Constant.POPULATION.toString();
    }

    function applySettings() {
        var populationSize = clampInt(populationInput.value, 10, 120);
        var survivorsCount = clampInt(survivorsInput.value, 2, populationSize - 1);
        var mutationProbability = clampFloat(mutationInput.value, 0, 1);

        Constant.POPULATION = populationSize;
        Constant.SURVIVORS = survivorsCount;
        Constant.MUTATE_PROB = mutationProbability;
        Params.game_manager.PLAY_MODE = 1;

        if (window.game_manager) {
            window.game_manager.gameover = false;
            window.game_manager.generation = new Generation();
            window.game_manager.startGame();
            updateStats();
        }
    }

    function attachEvents() {
        statsAlive = document.getElementById('aliveCount');
        statsGeneration = document.getElementById('generationNumber');
        statsPopulation = document.getElementById('populationSizeValue');
        populationInput = document.getElementById('populationSize');
        survivorsInput = document.getElementById('survivorsCount');
        mutationInput = document.getElementById('mutationProb');
        startButton = document.getElementById('startBtn');

        if (startButton) {
            startButton.addEventListener('click', function(event){
                event.preventDefault();
                applySettings();
            });
        }

        if (populationInput) {
            populationInput.addEventListener('input', function() {
                var value = clampInt(this.value, 10, 120);
                this.value = value;
                if (survivorsInput) {
                    survivorsInput.max = Math.max(2, value - 1).toString();
                }
                updateStats();
            });
        }

        setInterval(updateStats, 200);
    }

    var originalLoadComplete = AssetManager.loadComplete;
    AssetManager.loadComplete = function() {
        if (typeof originalLoadComplete === 'function') {
            originalLoadComplete();
        }
        Params.game_manager.PLAY_MODE = 1;
        attachEvents();
    };
})();
