// Получить токен из localStorage
const token = localStorage.getItem('authToken')

// Если токена нет, перенаправляем на авторизацию
if (!token) {
    window.location.href = '/auth'
}

// Загрузить профиль при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    loadProfile()
    loadSkins()
})

// Загрузить информацию профиля
async function loadProfile() {
    try {
        const response = await fetch('/api/profile', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        })

        if (!response.ok) {
            if (response.status === 401) {
                localStorage.removeItem('authToken')
                window.location.href = '/auth'
                return
            }
            throw new Error('Ошибка загрузки профиля')
        }

        const data = await response.json()
        
        // Обновляем информацию на странице
        document.getElementById('username').textContent = data.username
        document.getElementById('email').textContent = data.email
        document.getElementById('score').textContent = data.score

        // Сохраняем userId для использования в других функциях
        localStorage.setItem('userId', data.id)

    } catch (error) {
        console.error('Ошибка:', error)
        showNotification('Ошибка при загрузке профиля')
    }
}

// Загрузить скины
async function loadSkins() {
    try {
        const response = await fetch('/api/skins', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        })

        if (!response.ok) {
            throw new Error('Ошибка загрузки скинов')
        }

        const skins = await response.json()
        const container = document.getElementById('skinsContainer')
        container.innerHTML = ''

        skins.forEach(skin => {
            const skinCard = createSkinCard(skin)
            container.appendChild(skinCard)
        })

    } catch (error) {
        console.error('Ошибка:', error)
        showNotification('Ошибка при загрузке скинов')
    }
}

// Создать карточку скина
function createSkinCard(skin) {
    const card = document.createElement('div')
    card.className = 'skin-card'
    
    if (skin.owned) {
        card.classList.add('owned')
    }
    if (!skin.available && !skin.owned) {
        card.classList.add('locked')
    }

    // Преобразуем путь для фронтенда
    const imagePath = skin.asset_url

    card.innerHTML = `
        <div class="skin-image ${!imagePath ? 'no-image' : ''}">
            ${imagePath ? `<img src="${imagePath}" alt="${skin.name}" onerror="this.style.display='none'">` : '🐦'}
            ${!skin.available && !skin.owned ? `<div class="skin-locked-overlay">🔒</div>` : ''}
        </div>
        <div class="skin-info">
            <div class="skin-name">${skin.name}</div>
            <div class="skin-price">
                🎯 <span class="skin-price-value">${skin.price}</span> очков
            </div>
            <div class="skin-status ${skin.owned ? 'owned' : (skin.available ? 'unlocked' : 'locked')}">
                ${skin.owned ? 'У вас есть' : (skin.available ? 'Разблокирован' : 'Заблокирован')}
            </div>
            <div class="skin-buttons">
                ${skin.available ? `
                    <button class="btn-select ${skin.owned ? 'selected' : ''}" onclick="selectSkin(${skin.id})">
                        ${skin.owned ? 'Выбран' : 'Выбрать'}
                    </button>
                ` : `
                    <button class="btn-select" disabled>Недоступно</button>
                `}
            </div>
        </div>
    `

    return card
}

// Установить скин
async function selectSkin(skinId) {
    try {
        const response = await fetch('/api/profile/set-skin', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ skinId })
        })

        if (!response.ok) {
            const error = await response.json()
            throw new Error(error.message || 'Ошибка при установке скина')
        }

        const data = await response.json()
        showNotification('Скин успешно установлен! ✓')
        
        // Перезагружаем скины для обновления интерфейса
        loadSkins()

    } catch (error) {
        console.error('Ошибка:', error)
        showNotification(error.message || 'Ошибка при установке скина')
    }
}

// Выход из профиля
function logout() {
    localStorage.removeItem('authToken')
    localStorage.removeItem('userId')
    window.location.href = '/auth'
}

// Показать уведомление
function showNotification(message) {
    const modal = document.getElementById('notificationModal')
    const messageElement = document.getElementById('notificationMessage')
    messageElement.textContent = message
    modal.classList.add('active')
}

// Закрыть уведомление
function closeNotification() {
    const modal = document.getElementById('notificationModal')
    modal.classList.remove('active')
}
