import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import { Op } from 'sequelize'
import sequelize from './sequelize.js'
import { Auth, User, Skin, UserSkin } from './models/mapping.js'

const app = express()
app.use(express.json())
app.use(cors())
const PORT = process.env.PORT || 5000

const __dirname = dirname(fileURLToPath(import.meta.url))

// Middleware для проверки BearerToken
const validateToken = (req, res, next) => {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: "Отсутствует токен авторизации" })
    }

    const token = authHeader.substring(7)
    req.token = token
    req.userId = extractUserIdFromToken(token)
    
    if (!req.userId) {
        return res.status(401).json({ message: "Невалидный токен" })
    }

    next()
}

// Функция для извлечения userId из токена
const extractUserIdFromToken = (token) => {
    try {
        const parts = token.split('_')
        if (parts.length >= 3 && parts[0] === 'token') {
            const authId = parseInt(parts[1])
            return authId
        }
        return null
    } catch (error) {
        return null
    }
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
        const { skinId } = req.body

        if (!skinId) {
            return res.status(400).json({ message: "skinId обязателен" })
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
        const { score } = req.body

        if (typeof score !== 'number' || score < 0) {
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