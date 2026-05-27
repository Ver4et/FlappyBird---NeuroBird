import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import { Op } from 'sequelize'
import crypto from 'crypto'
import sequelize from './sequelize.js'
import { Auth, User, Skin, UserSkin } from './models/mapping.js'

const app = express()
app.use(express.json({ limit: '10kb' }))
app.use(express.urlencoded({ extended: false, limit: '10kb' }))
app.use(cors({ methods: ['GET', 'POST', 'OPTIONS'], allowedHeaders: ['Content-Type', 'Authorization'] }))
const PORT = process.env.PORT || 5000

const __dirname = dirname(fileURLToPath(import.meta.url))

const TOKEN_SECRET = process.env.TOKEN_SECRET || 'default_token_secret'
const TOKEN_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000
const MAX_LOGIN_ATTEMPTS = 5
const LOGIN_WINDOW_MS = 15 * 60 * 1000
const loginAttempts = new Map()

const safeCompare = (a, b) => {
    try {
        const aBuf = Buffer.from(a, 'utf-8')
        const bBuf = Buffer.from(b, 'utf-8')
        if (aBuf.length !== bBuf.length) return false
        return crypto.timingSafeEqual(aBuf, bBuf)
    } catch {
        return false
    }
}

const sanitizeString = (value) => {
    if (typeof value !== 'string') return ''
    return value.trim()
        .replace(/<[^>]*>/g, '')
        .replace(/[\x00-\x1F\x7F]/g, '')
}

const isValidEmail = (email) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

const isValidLogin = (login) => {
    return /^[a-zA-Z0-9_-]{3,30}$/.test(login)
}

const isValidUsername = (username) => {
    return /^[a-zA-Z0-9 _-]{3,30}$/.test(username)
}

const hashPassword = (password) => {
    const salt = crypto.randomBytes(16).toString('hex')
    const derivedKey = crypto.scryptSync(password, salt, 64).toString('hex')
    return `${salt}:${derivedKey}`
}

const verifyPassword = (password, storedPassword) => {
    try {
        const [salt, key] = storedPassword.split(':')
        if (!salt || !key) return false
        const derivedKey = crypto.scryptSync(password, salt, 64).toString('hex')
        return safeCompare(derivedKey, key)
    } catch {
        return false
    }
}

const createAuthToken = (userId) => {
    const timestamp = Date.now()
    const payload = `${userId}:${timestamp}`
    const signature = crypto.createHmac('sha256', TOKEN_SECRET).update(payload).digest('hex')
    return `token_${payload}.${signature}`
}

const verifyAuthToken = (token) => {
    if (typeof token !== 'string' || !token.startsWith('token_')) return null
    const tokenBody = token.slice(6)
    const parts = tokenBody.split('.')
    if (parts.length !== 2) return null
    const [payload, signature] = parts
    const expectedSignature = crypto.createHmac('sha256', TOKEN_SECRET).update(payload).digest('hex')
    if (!safeCompare(signature, expectedSignature)) return null
    const [idStr, timestampStr] = payload.split(':')
    const userId = Number(idStr)
    const timestamp = Number(timestampStr)
    if (!Number.isInteger(userId) || !Number.isInteger(timestamp)) return null
    if (Date.now() - timestamp > TOKEN_MAX_AGE_MS) return null
    return userId
}

const checkLoginRateLimit = (ip) => {
    const now = Date.now()
    const record = loginAttempts.get(ip) || { count: 0, firstAttempt: now }
    if (now - record.firstAttempt > LOGIN_WINDOW_MS) {
        record.count = 0
        record.firstAttempt = now
    }
    record.count += 1
    loginAttempts.set(ip, record)
    return record.count <= MAX_LOGIN_ATTEMPTS
}

app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('X-Frame-Options', 'DENY')
    res.setHeader('Referrer-Policy', 'no-referrer')
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin')
    next()
})

// Middleware для проверки BearerToken
const validateToken = (req, res, next) => {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: "Отсутствует токен авторизации" })
    }

    const token = authHeader.substring(7)
    req.token = token
    req.userId = verifyAuthToken(token)

    if (!req.userId) {
        return res.status(401).json({ message: "Невалидный токен" })
    }

    next()
}

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

app.get("/profile", (req, res) => {
    res.sendFile(path.join(__dirname, "public/profile.html"))
})

// API для регистрации
app.post("/api/auth/register", async (req, res) => {
    try {
        const login = sanitizeString(req.body.login)
        const email = sanitizeString(req.body.email)
        const username = sanitizeString(req.body.username)
        const password = sanitizeString(req.body.password)

        if (!login || !email || !username || !password) {
            return res.status(400).json({ message: "Все поля обязательны" })
        }

        if (!isValidLogin(login)) {
            return res.status(400).json({ message: "Логин должен содержать 3-30 символов: буквы, цифры, _ или -" })
        }

        if (!isValidUsername(username)) {
            return res.status(400).json({ message: "Имя пользователя должно содержать 3-30 символов и может включать пробелы" })
        }

        if (!isValidEmail(email)) {
            return res.status(400).json({ message: "Введите корректный email" })
        }

        if (password.length < 6) {
            return res.status(400).json({ message: "Пароль должен быть минимум 6 символов" })
        }

        const existingAuth = await Auth.findOne({ where: { login } })
        if (existingAuth) {
            return res.status(409).json({ message: "Логин уже занят" })
        }

        const existingUser = await User.findOne({ where: { email } })
        if (existingUser) {
            return res.status(409).json({ message: "Email уже зарегистрирован" })
        }

        const authRecord = await Auth.create({
            login,
            password: hashPassword(password),
            is_blocked: false
        })

        const userRecord = await User.create({
            email,
            username,
            id_Auth: authRecord.id,
            current_score: 0
        })

        // Даём пользователю дефолтный скин
        const defaultSkin = await Skin.findOne({ where: { name: 'bird1' } })
        if (defaultSkin) {
            await UserSkin.create({
                id_User: userRecord.id,
                id_Skin: defaultSkin.id
            })
            userRecord.id_CurrentSkin = defaultSkin.id
            await userRecord.save()
        }

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
        const login = sanitizeString(req.body.login)
        const password = sanitizeString(req.body.password)
        const clientIp = req.ip || req.connection.remoteAddress || 'unknown'

        if (!checkLoginRateLimit(clientIp)) {
            return res.status(429).json({ message: "Слишком много попыток входа. Попробуйте позже." })
        }

        if (!login || !password) {
            return res.status(400).json({ message: "Логин и пароль обязательны" })
        }

        if (!isValidLogin(login)) {
            return res.status(400).json({ message: "Неверный логин или пароль" })
        }

        const authRecord = await Auth.findOne({ where: { login } })
        if (!authRecord || !verifyPassword(password, authRecord.password)) {
            return res.status(401).json({ message: "Неверный логин или пароль" })
        }

        if (authRecord.is_blocked) {
            return res.status(403).json({ message: "Аккаунт заблокирован" })
        }

        const user = await User.findOne({ where: { id_Auth: authRecord.id } })
        if (!user) {
            return res.status(404).json({ message: "Данные пользователя не найдены" })
        }

        const token = createAuthToken(authRecord.id)

        res.status(200).json({
            message: "Авторизация успешна",
            token,
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
        const userId = Number(req.params.id)
        if (!Number.isInteger(userId) || userId <= 0) {
            return res.status(400).json({ message: "Некорректный идентификатор пользователя" })
        }

        const user = await User.findByPk(userId, {
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

// API для получения профиля пользователя с токеном
app.get("/api/profile", validateToken, async (req, res) => {
    try {
        const auth = await Auth.findByPk(req.userId)
        if (!auth) {
            return res.status(401).json({ message: "Пользователь не найден" })
        }

        const user = await User.findOne({ 
            where: { id_Auth: req.userId },
            include: [
                { model: Skin, as: 'Skins', through: { attributes: [] } }
            ]
        })

        if (!user) {
            return res.status(404).json({ message: "Данные пользователя не найдены" })
        }

        // Получаем текущий скин
        const currentSkin = user.id_CurrentSkin ? await Skin.findByPk(user.id_CurrentSkin) : null

        res.status(200).json({
            id: user.id,
            username: user.username,
            email: user.email,
            score: user.current_score,
            currentSkin: currentSkin ? {
                id: currentSkin.id,
                name: currentSkin.name,
                asset_url: currentSkin.asset_url
            } : null,
            ownedSkins: user.Skins.map(skin => ({
                id: skin.id,
                name: skin.name,
                asset_url: skin.asset_url,
                price: skin.price
            }))
        })

    } catch (error) {
        console.error(error)
        res.status(500).json({ message: "Ошибка сервера" })
    }
})

// API для получения всех доступных скинов для пользователя
app.get("/api/skins", validateToken, async (req, res) => {
    try {
        const auth = await Auth.findByPk(req.userId)
        if (!auth) {
            return res.status(401).json({ message: "Пользователь не найден" })
        }

        const user = await User.findOne({
            where: { id_Auth: req.userId },
            include: [
                { model: Skin, as: 'Skins', through: { attributes: [] } }
            ]
        })

        if (!user) {
            return res.status(404).json({ message: "Данные пользователя не найдены" })
        }

        // Получаем все скины
        const allSkins = await Skin.findAll()

        const skinsWithStatus = allSkins.map(skin => {
            const isOwned = user.Skins.some(s => s.id === skin.id)
            const isAvailable = user.current_score >= skin.price
            return {
                id: skin.id,
                name: skin.name,
                price: skin.price,
                asset_url: skin.asset_url,
                owned: isOwned,
                available: isAvailable || isOwned
            }
        })

        res.status(200).json(skinsWithStatus)

    } catch (error) {
        console.error(error)
        res.status(500).json({ message: "Ошибка сервера" })
    }
})

// API для установки текущего скина
app.post("/api/profile/set-skin", validateToken, async (req, res) => {
    try {
        const skinId = Number(req.body.skinId)

        if (!Number.isInteger(skinId) || skinId <= 0) {
            return res.status(400).json({ message: "skinId обязателен и должен быть числом" })
        }

        const auth = await Auth.findByPk(req.userId)
        if (!auth) {
            return res.status(401).json({ message: "Пользователь не найден" })
        }

        const user = await User.findOne({ where: { id_Auth: req.userId } })
        if (!user) {
            return res.status(404).json({ message: "Данные пользователя не найдены" })
        }

        const skin = await Skin.findByPk(skinId)
        if (!skin) {
            return res.status(404).json({ message: "Скин не найден" })
        }

        // Проверяем, владеет ли пользователь этим скином
        const hasHabitSkin = await UserSkin.findOne({
            where: { id_User: user.id, id_Skin: skinId }
        })

        if (!hasHabitSkin) {
            return res.status(403).json({ message: "У вас нет этого скина" })
        }

        // Устанавливаем текущий скин
        user.id_CurrentSkin = skinId
        await user.save()

        res.status(200).json({
            message: "Скин успешно установлен",
            currentSkin: {
                id: skin.id,
                name: skin.name,
                asset_url: skin.asset_url
            }
        })

    } catch (error) {
        console.error(error)
        res.status(500).json({ message: "Ошибка сервера" })
    }
})

// API для обновления счёта очков
app.post("/api/profile/update-score", validateToken, async (req, res) => {
    try {
        const score = Number(req.body.score)

        if (!Number.isFinite(score) || score < 0) {
            return res.status(400).json({ message: "score должен быть положительным числом" })
        }

        const auth = await Auth.findByPk(req.userId)
        if (!auth) {
            return res.status(401).json({ message: "Пользователь не найден" })
        }

        const user = await User.findOne({ where: { id_Auth: req.userId } })
        if (!user) {
            return res.status(404).json({ message: "Данные пользователя не найдены" })
        }

        // Обновляем счет если новый счет больше старого
        if (score > user.current_score) {
            user.current_score = score
            await user.save()

            // Проверяем, какие скины теперь доступны и добавляем их пользователю
            const availableSkins = await Skin.findAll({
                where: {
                    price: { [Op.lte]: score }
                }
            })

            // Добавляем скины которые пользователь не имеет
            for (const skin of availableSkins) {
                const hasHabitSkin = await UserSkin.findOne({
                    where: { id_User: user.id, id_Skin: skin.id }
                })
                if (!hasHabitSkin) {
                    await UserSkin.create({
                        id_User: user.id,
                        id_Skin: skin.id
                    })
                }
            }
        }

        res.status(200).json({
            message: "Счет обновлен",
            score: user.current_score
        })

    } catch (error) {
        console.error(error)
        res.status(500).json({ message: "Ошибка сервера" })
    }
})

// Статические файлы ПОСЛЕ всех маршрутов
app.use(express.static("public"))

const initializeSkins = async () => {
    const skinsData = [
        { name: 'bird1', price: 0, asset_url: '/assets/photos/bird1.png' },
        { name: 'birdpumkin', price: 25, asset_url: '/assets/photos/skins/birdPumkin.png' },
        { name: 'winterBird', price: 50, asset_url: '/assets/photos/skins/winterBird.png' },
        { name: 'birdPilot', price: 75, asset_url: '/assets/photos/skins/birdPilot.png' },
        { name: 'newyearbird', price: 100, asset_url: '/assets/photos/skins/newyearbird.png' },
        { name: 'birdKing', price: 200, asset_url: '/assets/photos/skins/BirdKing.png' }
    ]

    for (const skinData of skinsData) {
        const existingSkin = await Skin.findOne({ where: { name: skinData.name } })
        if (!existingSkin) {
            await Skin.create(skinData)
            console.log(`✓ Скин "${skinData.name}" добавлен в БД`)
        } else if (existingSkin.asset_url !== skinData.asset_url || existingSkin.price !== skinData.price) {
            existingSkin.asset_url = skinData.asset_url
            existingSkin.price = skinData.price
            await existingSkin.save()
            console.log(`✓ Скин "${skinData.name}" обновлен в БД`)
        }
    }
}

const start = async () => {
    try {
        // Аутентификация с БД
        await sequelize.authenticate()
        console.log("✓ Подключение к БД успешно")

        // Синхронизация моделей (создание таблиц)
        await sequelize.sync({ alter: true })
        console.log("✓ Таблицы синхронизированы")

        // Инициализация скинов
        await initializeSkins()
        console.log("✓ Скины инициализированы")

        // Запуск сервера
        app.listen(PORT, () => {
            console.log(`✓ Сервер запущен на порту ${PORT}`)
            console.log(`✓ Страница авторизации: http://localhost:${PORT}/auth`)
            console.log(`✓ Личный кабинет: http://localhost:${PORT}/profile`)
            console.log(`✓ Главная страница: http://localhost:${PORT}/`)
        })
    } catch (error) {
        console.error("✗ Ошибка при запуске:", error)
        process.exit(1)
    }
}

start()