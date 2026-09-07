import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import { Op } from 'sequelize'
import crypto from 'crypto'
import sequelize from './sequelize.js'
import { Auth, User, Skin, UserSkin, Role, EvolutionRun } from './models/mapping.js'

const app = express()
app.use(express.json({ limit: '10kb' }))
app.use(express.urlencoded({ extended: false, limit: '10kb' }))
const configuredOrigins = (process.env.CORS_ORIGIN || '').split(',').map(origin => origin.trim()).filter(Boolean)
app.use(cors({
    origin: configuredOrigins.length ? configuredOrigins : true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}))
const PORT = process.env.PORT || 5000

const __dirname = dirname(fileURLToPath(import.meta.url))

const TOKEN_SECRET = process.env.TOKEN_SECRET
if (!TOKEN_SECRET && process.env.NODE_ENV === 'production') {
    throw new Error('TOKEN_SECRET обязателен в production')
}
const authTokenSecret = TOKEN_SECRET || crypto.randomBytes(32).toString('hex')
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
    const signature = crypto.createHmac('sha256', authTokenSecret).update(payload).digest('hex')
    return `token_${payload}.${signature}`
}

const verifyAuthToken = (token) => {
    if (typeof token !== 'string' || !token.startsWith('token_')) return null
    const tokenBody = token.slice(6)
    const parts = tokenBody.split('.')
    if (parts.length !== 2) return null
    const [payload, signature] = parts
    const expectedSignature = crypto.createHmac('sha256', authTokenSecret).update(payload).digest('hex')
    if (!safeCompare(signature, expectedSignature)) return null
    const [idStr, timestampStr] = payload.split(':')
    const userId = Number(idStr)
    const timestamp = Number(timestampStr)
    if (!Number.isInteger(userId) || !Number.isInteger(timestamp)) return null
    if (Date.now() - timestamp > TOKEN_MAX_AGE_MS) return null
    return userId
}

const getDefaultSkin = async (options = {}) => {
    return await Skin.findOne({ where: { name: 'Классика' }, ...options })
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

app.get('/health', async (req, res) => {
    try {
        await sequelize.authenticate()
        res.status(200).json({ status: 'ok', database: 'ok' })
    } catch (error) {
        res.status(503).json({ status: 'degraded', database: 'unavailable' })
    }
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

app.get("/admin", (req, res) => {
    res.sendFile(path.join(__dirname, "public/admin.html"))
})

// API для регистрации
app.post("/api/auth/register", async (req, res) => {
    let transaction
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

        transaction = await sequelize.transaction()

        const existingAuth = await Auth.findOne({ where: { login }, transaction })
        if (existingAuth) {
            return res.status(409).json({ message: "Логин уже занят" })
        }

        const existingUser = await User.findOne({ where: { email }, transaction })
        if (existingUser) {
            return res.status(409).json({ message: "Email уже зарегистрирован" })
        }

        const authRecord = await Auth.create({
            login,
            password: hashPassword(password),
            is_blocked: false
        }, { transaction })

        const userRecord = await User.create({
            email,
            username,
            id_Auth: authRecord.id,
            current_score: 0
        }, { transaction })

        // Даём пользователю дефолтный скин
        const defaultSkin = await getDefaultSkin({ transaction })
        if (defaultSkin) {
            await UserSkin.create({
                id_User: userRecord.id,
                id_Skin: defaultSkin.id
            }, { transaction })
            userRecord.id_CurrentSkin = defaultSkin.id
            await userRecord.save({ transaction })
        }

        await transaction.commit()

        res.status(201).json({
            message: "Регистрация успешна",
            userId: userRecord.id,
            username: userRecord.username
        })

    } catch (error) {
        console.error(error)
        res.status(500).json({ message: "Ошибка сервера при регистрации" })
    } finally {
        if (transaction && !transaction.finished) {
            await transaction.rollback()
        }
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
        const role = user.id_Role ? await Role.findByPk(user.id_Role) : null

        res.status(200).json({
            message: "Авторизация успешна",
            token,
            userId: user.id,
            username: user.username,
            email: user.email,
            score: user.current_score,
            role: role ? role.name : 'user'
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
        let currentSkin = user.id_CurrentSkin ? await Skin.findByPk(user.id_CurrentSkin) : null
        if (!currentSkin) {
            currentSkin = await getDefaultSkin()
            if (currentSkin) {
                user.id_CurrentSkin = currentSkin.id
                await user.save()
            }
        }

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

// API для получения статистики сайта (для админ-панели)
app.get("/api/admin/stats", validateToken, async (req, res) => {
    try {
        const auth = await Auth.findByPk(req.userId)
        if (!auth) {
            return res.status(401).json({ message: "Пользователь не найден" })
        }

        const user = await User.findOne({ where: { id_Auth: req.userId } })
        if (!user) {
            return res.status(404).json({ message: "Данные пользователя не найдены" })
        }

        const userRole = user.id_Role ? await Role.findByPk(user.id_Role) : null
        if (!userRole || userRole.name !== 'admin') {
            return res.status(403).json({ message: "Доступ запрещен" })
        }

        const totalUsers = await User.count()
        const totalSkins = await Skin.count()
        const totalSessions = await Auth.count()

        res.status(200).json({
            totalUsers,
            totalSkins,
            totalSessions,
            status: "Все системы работают нормально"
        })

    } catch (error) {
        console.error(error)
        res.status(500).json({ message: "Ошибка сервера" })
    }
})

// API для получения списка всех пользователей (для админ-панели)
app.get("/api/admin/users", validateToken, async (req, res) => {
    try {
        const auth = await Auth.findByPk(req.userId)
        if (!auth) {
            return res.status(401).json({ message: "Пользователь не найден" })
        }

        const user = await User.findOne({ where: { id_Auth: req.userId } })
        if (!user) {
            return res.status(404).json({ message: "Данные пользователя не найдены" })
        }

        const userRole = user.id_Role ? await Role.findByPk(user.id_Role) : null
        if (!userRole || userRole.name !== 'admin') {
            return res.status(403).json({ message: "Доступ запрещен" })
        }

        const users = await User.findAll({
            attributes: ['id', 'username', 'email', 'current_score', 'id_Role'],
            include: {
                model: Role,
                attributes: ['name'],
                required: false
            }
        })

        res.status(200).json(users.map(u => ({
            id: u.id,
            username: u.username,
            email: u.email,
            score: u.current_score,
            role: u.Role ? u.Role.name : 'user'
        })))

    } catch (error) {
        console.error(error)
        res.status(500).json({ message: "Ошибка сервера" })
    }
})

// API для удаления пользователя (для админ-панели)
app.post("/api/admin/users/:id/delete", validateToken, async (req, res) => {
    try {
        const auth = await Auth.findByPk(req.userId)
        if (!auth) {
            return res.status(401).json({ message: "Пользователь не найден" })
        }

        const user = await User.findOne({ where: { id_Auth: req.userId } })
        if (!user) {
            return res.status(404).json({ message: "Данные пользователя не найдены" })
        }

        const userRole = user.id_Role ? await Role.findByPk(user.id_Role) : null
        if (!userRole || userRole.name !== 'admin') {
            return res.status(403).json({ message: "Доступ запрещен" })
        }

        const targetUserId = Number(req.params.id)
        if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
            return res.status(400).json({ message: "Некорректный идентификатор пользователя" })
        }

        const targetUser = await User.findByPk(targetUserId)
        if (!targetUser) {
            return res.status(404).json({ message: "Пользователь не найден" })
        }

        // Удаляем скины пользователя
        await UserSkin.destroy({ where: { id_User: targetUserId } })

        // Удаляем записи эволюции
        await EvolutionRun.destroy({ where: { id_User: targetUserId } })

        // Удаляем пользователя
        await User.destroy({ where: { id: targetUserId } })

        // Удаляем учетную запись
        if (targetUser.id_Auth) {
            await Auth.destroy({ where: { id: targetUser.id_Auth } })
        }

        res.status(200).json({ message: "Пользователь успешно удален" })

    } catch (error) {
        console.error(error)
        res.status(500).json({ message: "Ошибка сервера" })
    }
})

// API для обновления параметров пользователя (для админ-панели)
app.post("/api/admin/users/:id/update", validateToken, async (req, res) => {
    try {
        const auth = await Auth.findByPk(req.userId)
        if (!auth) {
            return res.status(401).json({ message: "Пользователь не найден" })
        }

        const user = await User.findOne({ where: { id_Auth: req.userId } })
        if (!user) {
            return res.status(404).json({ message: "Данные пользователя не найдены" })
        }

        const userRole = user.id_Role ? await Role.findByPk(user.id_Role) : null
        if (!userRole || userRole.name !== 'admin') {
            return res.status(403).json({ message: "Доступ запрещен" })
        }

        const targetUserId = Number(req.params.id)
        if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
            return res.status(400).json({ message: "Некорректный идентификатор пользователя" })
        }

        const targetUser = await User.findByPk(targetUserId)
        if (!targetUser) {
            return res.status(404).json({ message: "Пользователь не найден" })
        }

        const username = req.body.username ? sanitizeString(req.body.username) : null
        const score = req.body.score !== undefined ? Number(req.body.score) : null

        if (username && isValidUsername(username)) {
            targetUser.username = username
        }

        if (score !== null && Number.isFinite(score) && score >= 0) {
            targetUser.current_score = score
        }

        await targetUser.save()

        res.status(200).json({
            message: "Параметры пользователя обновлены",
            user: {
                id: targetUser.id,
                username: targetUser.username,
                email: targetUser.email,
                score: targetUser.current_score
            }
        })

    } catch (error) {
        console.error(error)
        res.status(500).json({ message: "Ошибка сервера" })
    }
})

// Статические файлы ПОСЛЕ всех маршрутов
app.use(express.static(path.join(__dirname, 'public')))

const initializeSkins = async () => {
    const skinsData = [
        { name: 'Классика', price: 0, asset_url: '/assets/photos/bird1.png' },
        { name: 'Пциква', price: 25, asset_url: '/assets/photos/skins/birdPumkin.png' },
        { name: 'Зимняя птичка', price: 50, asset_url: '/assets/photos/skins/winterBird.png' },
        { name: 'Птица-пилот', price: 75, asset_url: '/assets/photos/skins/birdPilot.png' },
        { name: 'Новый год', price: 100, asset_url: '/assets/photos/skins/newyearbird.png' },
        { name: 'Черная птичка', price: 125, asset_url: '/assets/photos/skins/BlackBird.png' },
        { name: 'Самурай птичка', price: 150, asset_url: '/assets/photos/skins/GreenKomboBird.png' },
        { name: 'Король птиц', price: 500, asset_url: '/assets/photos/skins/BirdKing.png' }
    ]

    const skinNames = skinsData.map(s => s.name.trim())
    const allSkins = await Skin.findAll()

    // Удаляем явно дублирующиеся записи по имени
    const seenNames = new Set()
    const duplicateSkinIds = []
    for (const skin of allSkins) {
        const normalizedName = skin.name.trim()
        if (seenNames.has(normalizedName)) {
            duplicateSkinIds.push(skin.id)
        } else {
            seenNames.add(normalizedName)
        }
    }

    if (duplicateSkinIds.length) {
        console.log(`✓ Удаляю ${duplicateSkinIds.length} дублирующих записей скинов`)
        await UserSkin.destroy({ where: { id_Skin: duplicateSkinIds } })
        await Skin.destroy({ where: { id: duplicateSkinIds } })
    }

    // Обновляем / добавляем актуальные скины из файла
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

    // Удаляем устаревшие скины, которых нет в текущем списке
    const currentSkins = await Skin.findAll({ where: { name: { [Op.in]: skinNames } } })
    const currentSkinIds = currentSkins.map(skin => skin.id)
    const obsoleteSkins = await Skin.findAll({ where: { id: { [Op.notIn]: currentSkinIds } } })

    if (obsoleteSkins.length) {
        const obsoleteIds = obsoleteSkins.map(skin => skin.id)
        const defaultSkin = currentSkins.find(skin => skin.name.trim() === 'Классика') || currentSkins[0]

        if (defaultSkin) {
            await User.update(
                { id_CurrentSkin: defaultSkin.id },
                { where: { id_CurrentSkin: obsoleteIds } }
            )
        }

        await UserSkin.destroy({ where: { id_Skin: obsoleteIds } })
        await Skin.destroy({ where: { id: obsoleteIds } })
        console.log(`✓ Удалено ${obsoleteIds.length} устаревших скинов из БД`)
    }
}

const initializeRoles = async () => {
    const rolesData = [
        { name: 'user' },
        { name: 'admin' }
    ]

    for (const roleData of rolesData) {
        const existingRole = await Role.findOne({ where: { name: roleData.name } })
        if (!existingRole) {
            await Role.create(roleData)
            console.log(`✓ Роль "${roleData.name}" добавлена в БД`)
        }
    }
}

const initializeAdmin = async () => {
    const adminLogin = process.env.ADMIN_LOGIN
    const adminPassword = process.env.ADMIN_PASSWORD
    if (!adminLogin || !adminPassword) {
        console.log('! ADMIN_LOGIN/ADMIN_PASSWORD не заданы: bootstrap-администратор не создаётся')
        return
    }

    const adminAuth = await Auth.findOne({ where: { login: adminLogin } })
    if (!adminAuth) {
        const adminRole = await Role.findOne({ where: { name: 'admin' } })
        if (!adminRole) {
            console.log("✗ Роль админ не найдена")
            return
        }

        const newAdminAuth = await Auth.create({
            login: adminLogin,
            password: hashPassword(adminPassword),
            is_blocked: false
        })

        await User.create({
            email: 'admin@flappybird.local',
            username: adminLogin,
            id_Auth: newAdminAuth.id,
            current_score: 0,
            id_Role: adminRole.id
        })

        console.log(`✓ Администратор ${adminLogin} создан в БД`)
    }
}

const start = async () => {
    try {
        await sequelize.authenticate()
        await sequelize.sync()
        await initializeRoles()
        await initializeAdmin()
        await initializeSkins()
        app.listen(PORT, () => { console.log(`Сервер запущен на порту ${PORT}`)})
    } catch (error) {
        console.error("✗ Ошибка при запуске:", error)
        process.exit(1)
    }
}

start()