// Переключение между формами
function switchForm(formType) {
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');

    if (formType === 'login') {
        loginForm.classList.add('active');
        registerForm.classList.remove('active');
        clearErrors();
    } else if (formType === 'register') {
        registerForm.classList.add('active');
        loginForm.classList.remove('active');
        clearErrors();
    }
}

// Очистка ошибок
function clearErrors() {
    document.getElementById('loginError').textContent = '';
    document.getElementById('loginError').classList.remove('show');
    document.getElementById('registerError').textContent = '';
    document.getElementById('registerError').classList.remove('show');
    document.getElementById('registerSuccess').textContent = '';
    document.getElementById('registerSuccess').classList.remove('show');
}

// Обработка отправки формы авторизации
document.getElementById('loginFormElement').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const loginInput = document.getElementById('login-username').value.trim();
    const passwordInput = document.getElementById('login-password').value.trim();
    const errorDiv = document.getElementById('loginError');
    const submitBtn = e.target.querySelector('.btn-submit');

    // Валидация
    if (!loginInput || !passwordInput) {
        showError(errorDiv, 'Заполните все поля');
        return;
    }

    submitBtn.disabled = true;
    submitBtn.classList.add('loading');

    try {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                login: loginInput,
                password: passwordInput
            })
        });

        const data = await response.json();

        if (response.ok) {
            // Сохраняем токен в localStorage
            localStorage.setItem('userToken', data.token);
            localStorage.setItem('userId', data.userId);
            localStorage.setItem('username', data.username);
            
            // Перенаправляем на главную
            setTimeout(() => {
                window.location.href = '/';
            }, 500);
        } else {
            showError(errorDiv, data.message || 'Ошибка авторизации');
        }
    } catch (error) {
        showError(errorDiv, 'Ошибка подключения к серверу');
        console.error(error);
    } finally {
        submitBtn.disabled = false;
        submitBtn.classList.remove('loading');
    }
});

// Обработка отправки формы регистрации
document.getElementById('registerFormElement').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const loginInput = document.getElementById('register-username').value.trim();
    const emailInput = document.getElementById('register-email').value.trim();
    const usernameInput = document.getElementById('register-username-display').value.trim();
    const passwordInput = document.getElementById('register-password').value.trim();
    const passwordConfirmInput = document.getElementById('register-password-confirm').value.trim();
    const errorDiv = document.getElementById('registerError');
    const successDiv = document.getElementById('registerSuccess');
    const submitBtn = e.target.querySelector('.btn-submit');

    // Очистка сообщений
    errorDiv.textContent = '';
    errorDiv.classList.remove('show');
    successDiv.textContent = '';
    successDiv.classList.remove('show');

    // Валидация
    if (!loginInput || !emailInput || !usernameInput || !passwordInput) {
        showError(errorDiv, 'Заполните все поля');
        return;
    }

    if (loginInput.length < 3) {
        showError(errorDiv, 'Логин должен быть минимум 3 символа');
        return;
    }

    if (passwordInput.length < 6) {
        showError(errorDiv, 'Пароль должен быть минимум 6 символов');
        return;
    }

    if (passwordInput !== passwordConfirmInput) {
        showError(errorDiv, 'Пароли не совпадают');
        return;
    }

    // Валидация email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailInput)) {
        showError(errorDiv, 'Введите корректный email');
        return;
    }

    submitBtn.disabled = true;
    submitBtn.classList.add('loading');

    try {
        const response = await fetch('/api/auth/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                login: loginInput,
                email: emailInput,
                username: usernameInput,
                password: passwordInput
            })
        });

        const data = await response.json();

        if (response.ok) {
            showSuccess(successDiv, 'Регистрация успешна! Переходим на вход...');
            
            // Очищаем форму
            document.getElementById('registerFormElement').reset();

            // Переходим на форму входа
            setTimeout(() => {
                switchForm('login');
                document.getElementById('login-username').focus();
            }, 2000);
        } else {
            showError(errorDiv, data.message || 'Ошибка регистрации');
        }
    } catch (error) {
        showError(errorDiv, 'Ошибка подключения к серверу');
        console.error(error);
    } finally {
        submitBtn.disabled = false;
        submitBtn.classList.remove('loading');
    }
});

// Показать ошибку
function showError(element, message) {
    element.textContent = message;
    element.classList.add('show');
}

// Показать успех
function showSuccess(element, message) {
    element.textContent = message;
    element.classList.add('show');
}

// Real-time валидация пароля
document.getElementById('register-password-confirm').addEventListener('input', function() {
    const password = document.getElementById('register-password').value;
    const confirm = this.value;
    
    if (confirm && password !== confirm) {
        this.style.borderColor = '#f66';
    } else if (confirm && password === confirm) {
        this.style.borderColor = '#6f6';
    } else {
        this.style.borderColor = '#fae689';
    }
});

// Проверка, авторизован ли пользователь
function checkAuth() {
    const token = localStorage.getItem('userToken');
    if (token) {
        // Если авторизован, перенаправляем на главную
        window.location.href = '/';
    }
}

// Проверяем при загрузке страницы
window.addEventListener('load', checkAuth);
