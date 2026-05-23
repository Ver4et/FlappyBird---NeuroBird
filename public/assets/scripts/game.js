// Simple wrapper for the human-only game page.

// Получить токен из localStorage
const gameToken = localStorage.getItem('authToken')

// Глобальная переменная для хранения скина игрока
window.currentPlayerSkin = 'bird1' // дефолтный скин для неавторизованных пользователей

// Загрузить текущий скин при загрузке страницы
async function loadCurrentSkin() {
    if (!gameToken) {
        return
    }

    try {
        const response = await fetch('/api/profile', {
            headers: {
                'Authorization': `Bearer ${gameToken}`
            }
        })

        if (!response.ok) {
            console.warn('Ошибка при загрузке профиля для скина')
            return
        }

            const data = await response.json()
        
        // Если у пользователя есть выбранный скин, используем его
        if (data.currentSkin && data.currentSkin.asset_url) {
            const skinName = data.currentSkin.name === 'default' ? 'bird1' : data.currentSkin.name || 'bird1'
            window.currentPlayerSkin = skinName
            console.log('Текущий скин:', skinName)

            if (typeof AssetManager !== 'undefined') {
                const src = data.currentSkin.asset_url.startsWith('/') ? data.currentSkin.asset_url : '/' + data.currentSkin.asset_url
                const assetObject = { name: skinName, src }
                AssetManager.loadImg([assetObject])
            }
        }

    } catch (error) {
        console.error('Ошибка при загрузке скина:', error)
    }
}

// Загружаем скин при загрузке страницы (до инициализации игры)
document.addEventListener('DOMContentLoaded', loadCurrentSkin)

window.mainAutoStart = true;
if (typeof Params !== 'undefined') {
    Params.game_manager.PLAY_MODE = 0;
}

// Функция для сохранения очков
async function saveGameScore(score) {
    if (!gameToken) {
        console.warn('Не удалось сохранить очки: нет авторизации')
        return
    }

    try {
        const response = await fetch('/api/profile/update-score', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${gameToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ score: Math.floor(score) })
        })

        if (!response.ok) {
            console.error('Ошибка при сохранении очков:', response.status)
            return
        }

        const data = await response.json()
        console.log('Очки сохранены:', data.score)

    } catch (error) {
        console.error('Ошибка при сохранении очков:', error)
    }
}

// Экспортируем функцию для использования в game_manager
window.saveGameScore = saveGameScore
