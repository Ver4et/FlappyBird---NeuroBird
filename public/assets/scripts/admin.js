const adminToken = localStorage.getItem('authToken')

if (!adminToken) {
    window.location.href = '/auth'
}

let allUsers = []
let editingUserId = null
let deletingUserId = null

document.addEventListener('DOMContentLoaded', async () => {
    loadStats()
    loadUsers()
    setupNavigation()
    setupEventListeners()
    setupModals()
})

function setupNavigation() {
    const navButtons = document.querySelectorAll('.nav-btn')
    const tabs = document.querySelectorAll('.admin-tab')

    navButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabName = btn.dataset.tab

            navButtons.forEach(b => b.classList.remove('active'))
            tabs.forEach(t => t.classList.remove('active'))

            btn.classList.add('active')
            document.getElementById(tabName).classList.add('active')
        })
    })
}

function setupEventListeners() {
    document.getElementById('logoutBtn').addEventListener('click', logout)
    document.getElementById('refreshBtn').addEventListener('click', loadUsers)
    document.getElementById('searchUser').addEventListener('input', filterUsers)
}

function setupModals() {
    const editModal = document.getElementById('editModal')
    const deleteModal = document.getElementById('deleteModal')

    document.getElementById('closeModalBtn').addEventListener('click', () => {
        editModal.classList.add('hidden')
    })

    document.getElementById('cancelEditBtn').addEventListener('click', () => {
        editModal.classList.add('hidden')
    })

    document.getElementById('cancelDeleteBtn').addEventListener('click', () => {
        deleteModal.classList.add('hidden')
    })

    document.getElementById('saveChangesBtn').addEventListener('click', saveUserChanges)
    document.getElementById('confirmDeleteBtn').addEventListener('click', confirmDelete)

    editModal.addEventListener('click', (e) => {
        if (e.target === editModal) {
            editModal.classList.add('hidden')
        }
    })

    deleteModal.addEventListener('click', (e) => {
        if (e.target === deleteModal) {
            deleteModal.classList.add('hidden')
        }
    })
}

async function loadStats() {
    try {
        const response = await fetch('/api/admin/stats', {
            headers: {
                'Authorization': `Bearer ${adminToken}`
            }
        })

        if (!response.ok) {
            console.error('Ошибка при загрузке статистики')
            return
        }

        const stats = await response.json()
        document.getElementById('totalUsers').textContent = stats.totalUsers
        document.getElementById('totalSkins').textContent = stats.totalSkins
        document.getElementById('totalSessions').textContent = stats.totalSessions

    } catch (error) {
        console.error('Ошибка при загрузке статистики:', error)
    }
}

async function loadUsers() {
    try {
        const response = await fetch('/api/admin/users', {
            headers: {
                'Authorization': `Bearer ${adminToken}`
            }
        })

        if (!response.ok) {
            console.error('Ошибка при загрузке пользователей')
            return
        }

        allUsers = await response.json()
        renderUsers(allUsers)

    } catch (error) {
        console.error('Ошибка при загрузке пользователей:', error)
    }
}

function renderUsers(users) {
    const tbody = document.getElementById('usersTableBody')
    
    if (users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="loading">Нет пользователей</td></tr>'
        return
    }

    tbody.innerHTML = users.map(user => `
        <tr>
            <td>${user.id}</td>
            <td>${user.username}</td>
            <td>${user.email}</td>
            <td>${user.score}</td>
            <td>
                <span class="role-badge role-${user.role}">
                    ${user.role === 'admin' ? 'Администратор' : 'Пользователь'}
                </span>
            </td>
            <td class="actions-cell">
                <button class="btn-small btn-edit" onclick="openEditModal(${user.id}, '${user.username}', ${user.score})">Изменить</button>
                ${user.role !== 'admin' ? `<button class="btn-small btn-delete" onclick="openDeleteModal(${user.id}, '${user.username}')">Удалить</button>` : ''}
            </td>
        </tr>
    `).join('')
}

function filterUsers() {
    const searchTerm = document.getElementById('searchUser').value.toLowerCase()
    const filtered = allUsers.filter(user => 
        user.username.toLowerCase().includes(searchTerm) ||
        user.email.toLowerCase().includes(searchTerm)
    )
    renderUsers(filtered)
}

function openEditModal(userId, username, score) {
    editingUserId = userId
    document.getElementById('editUsername').value = username
    document.getElementById('editScore').value = score
    document.getElementById('editModal').classList.remove('hidden')
}

async function saveUserChanges() {
    if (!editingUserId) return

    const username = document.getElementById('editUsername').value.trim()
    const score = Number(document.getElementById('editScore').value)

    if (!username || !Number.isFinite(score) || score < 0) {
        alert('Пожалуйста, заполните все поля корректно')
        return
    }

    try {
        const response = await fetch(`/api/admin/users/${editingUserId}/update`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${adminToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, score })
        })

        if (response.ok) {
            alert('Параметры пользователя обновлены')
            document.getElementById('editModal').classList.add('hidden')
            loadUsers()
        } else {
            alert('Ошибка при обновлении пользователя')
        }

    } catch (error) {
        console.error('Ошибка при обновлении пользователя:', error)
        alert('Ошибка при обновлении пользователя')
    }
}

function openDeleteModal(userId, username) {
    deletingUserId = userId
    document.getElementById('deleteUsername').textContent = username
    document.getElementById('deleteModal').classList.remove('hidden')
}

async function confirmDelete() {
    if (!deletingUserId) return

    try {
        const response = await fetch(`/api/admin/users/${deletingUserId}/delete`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${adminToken}`
            }
        })

        if (response.ok) {
            alert('Пользователь успешно удален')
            document.getElementById('deleteModal').classList.add('hidden')
            loadUsers()
        } else {
            alert('Ошибка при удалении пользователя')
        }

    } catch (error) {
        console.error('Ошибка при удалении пользователя:', error)
        alert('Ошибка при удалении пользователя')
    }
}

function logout() {
    localStorage.removeItem('authToken')
    window.location.href = '/'
}
