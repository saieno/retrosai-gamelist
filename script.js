let games = {};

async function loadGames() {
    const response = await fetch('games.json');
    games = await response.json();
    populatePlatforms();
    displayGames();
}

function populatePlatforms() {
    const platformSelect = document.getElementById('platform');
    Object.keys(games).forEach(platform => {
        const option = document.createElement('option');
        option.value = platform;
        option.textContent = platform;
        platformSelect.appendChild(option);
    });
}

function displayGames() {
    const search = document.getElementById('search').value.toLowerCase();
    const selectedPlatform = document.getElementById('platform').value;
    const gameList = document.getElementById('game-list');
    gameList.innerHTML = '';

    const platforms = selectedPlatform ? [selectedPlatform] : Object.keys(games);

    platforms.forEach(platform => {
        const filteredGames = games[platform].filter(game =>
            game.toLowerCase().includes(search)
        );

        if (filteredGames.length) {
            const platformHeader = document.createElement('h2');
            platformHeader.textContent = platform;
            gameList.appendChild(platformHeader);

            filteredGames.forEach(game => {
                const gameItem = document.createElement('div');
                gameItem.className = 'game-item';
                gameItem.textContent = game;
                gameList.appendChild(gameItem);
            });
        }
    });
}

document.getElementById('search').addEventListener('input', displayGames);
document.getElementById('platform').addEventListener('change', displayGames);

loadGames();
