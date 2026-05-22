import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import sequelize from './sequelize.js'
import { Auth, User, Skin, UserSkin } from './models/mapping.js'

const app = express()
app.use(express.json())
app.use(cors())
const PORT = process.env.PORT || 5000

const __dirname = dirname(fileURLToPath(import.meta.url))

// Маршруты для статических страниц
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public/index.html"))
})

app.get("/auth", (req, res) => {
    console.log("GET /auth request received")
    const filePath = path.join(__dirname, "public/auth.html")
    console.log("Sending file:", filePath)
    res.sendFile(filePath)
})

app.get("/info", (req, res) => {
    res.sendFile(path.join(__dirname, "public/info.html"))
})

app.get("/ai-game", (req, res) => {
    res.sendFile(path.join(__dirname, "public/aigame.html"))
})

app.get("/game", (req, res) => {
    res.sendFile(path.join(__dirname, "public/game.html"))
})

// API для регистрации
app.post("/api/auth/register", async (req, res) => {
    try {
        const { login, email, username, password } = req.body

        // Валидация входных данных
        if (!login || !email || !username || !password) {
            return res.status(400).json({ message: "Все поля обязательны" })
        }

        if (password.length < 6) {
            return res.status(400).json({ message: "Пароль должен быть минимум 6 символов" })
        }

        // Проверка, существует ли пользователь с таким логином
        const existingAuth = await Auth.findOne({ where: { login } })
        if (existingAuth) {
            return res.status(409).json({ message: "Логин уже занят" })
        }

        // Проверка, существует ли пользователь с таким email
        const existingUser = await User.findOne({ where: { email } })
        if (existingUser) {
            return res.status(409).json({ message: "Email уже зарегистрирован" })
        }

        // Создание записи в Auth (логин и пароль)
        const authRecord = await Auth.create({
            login: login,
            password: password,
            is_blocked: false
        })

        // Создание записи в User
        const userRecord = await User.create({
            email: email,
            username: username,
            id_Auth: authRecord.id,
            current_score: 0
        })

        res.status(201).json({
            message: "Регистрация успешна",
            userId: userRecord.id,
            username: userRecord.username
        })

    } catch (error) {
        console.error(error)
        res.status(500).json({ message: "Ошибка сервера при регистрации" })
    }
})

// API для авторизации
app.post("/api/auth/login", async (req, res) => {
    try {
        const { login, password } = req.body

        // Валидация входных данных
        if (!login || !password) {
            return res.status(400).json({ message: "Логин и пароль обязательны" })
        }

        // Поиск пользователя в Auth
        const authRecord = await Auth.findOne({ where: { login } })
        
        if (!authRecord) {
            return res.status(401).json({ message: "Неверный логин или пароль" })
        }

        // Проверка пароля (в реальной системе нужно использовать bcrypt!)
        if (authRecord.password !== password) {
            return res.status(401).json({ message: "Неверный логин или пароль" })
        }

        // Проверка, не заблокирован ли пользователь
        if (authRecord.is_blocked) {
            return res.status(403).json({ message: "Аккаунт заблокирован" })
        }

        // Получение данных пользователя
        const user = await User.findOne({ where: { id_Auth: authRecord.id } })
        
        if (!user) {
            return res.status(404).json({ message: "Данные пользователя не найдены" })
        }

        // В реальной системе здесь генерируется JWT токен
        const token = `token_${authRecord.id}_${Date.now()}`

        res.status(200).json({
            message: "Авторизация успешна",
            token: token,
            userId: user.id,
            username: user.username,
            email: user.email,
            score: user.current_score
        })

    } catch (error) {
        console.error(error)
        res.status(500).json({ message: "Ошибка сервера при авторизации" })
    }
})

// API для получения информации о пользователе
app.get("/api/user/:id", async (req, res) => {
    try {
        const user = await User.findByPk(req.params.id, {
            include: [Auth],
            attributes: ['id', 'email', 'username', 'current_score']
        })

        if (!user) {
            return res.status(404).json({ message: "Пользователь не найден" })
        }

        res.status(200).json({
            id: user.id,
            username: user.username,
            email: user.email,
            score: user.current_score
        })

    } catch (error) {
        console.error(error)
        res.status(500).json({ message: "Ошибка сервера" })
    }
})

// Статические файлы ПОСЛЕ всех маршрутов
app.use(express.static("public"))

const start = async () => {
    try {
        // Аутентификация с БД
        await sequelize.authenticate()
        console.log("✓ Подключение к БД успешно")

        // Синхронизация моделей (создание таблиц)
        await sequelize.sync({ alter: true })
        console.log("✓ Таблицы синхронизированы")

        // Запуск сервера
        app.listen(PORT, () => {
            console.log(`✓ Сервер запущен на порту ${PORT}`)
            console.log(`✓ Страница авторизации: http://localhost:${PORT}/auth`)
            console.log(`✓ Главная страница: http://localhost:${PORT}/`)
        })
    } catch (error) {
        console.error("✗ Ошибка при запуске:", error)
        process.exit(1)
    }
}

start()