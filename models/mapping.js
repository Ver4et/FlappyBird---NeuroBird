import { DataTypes } from "sequelize";
import sequelize from "../sequelize.js";

export const Auth = sequelize.define("Auth", {
    id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        autoIncrement: true,
        primaryKey: true
    },
    login: {
        type: DataTypes.STRING(255),
        allowNull: false
    },
    password: {
        type: DataTypes.STRING(255),
        allowNull: false
    },
    is_blocked: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
    }
}, { tableName: "Auth" });

export const User = sequelize.define("User", {
    id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        autoIncrement: true,
        primaryKey: true
    },
    email: {
        type: DataTypes.STRING(255),
        allowNull: false,
        unique: true,
        validate: { isEmail: true }
    },
    username: {
        type: DataTypes.STRING(255),
        allowNull: false,
    },
    id_Auth: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: 'Auth',
            key: 'id'
        }
    },
        current_score: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0 // Сюда начисляются очки за игру, отсюда они списываются
    },
    id_CurrentSkin: {
        type: DataTypes.INTEGER,
        allowNull: true, // true, чтобы при создании юзера не падала ошибка, пока скинов нет
        references: {
            model: 'Skin',
            key: 'id'
        }
    }
}, { tableName: 'User' });

User.belongsTo(Auth, { foreignKey: 'id_Auth' });
Auth.hasOne(User, { foreignKey: 'id_Auth' });


export const Skin = sequelize.define("Skin", {
    id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        autoIncrement: true,
        primaryKey: true
    },
    name: {
        type: DataTypes.STRING(100),
        allowNull: false,
        unique: true
    },
    price: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0 // стартовый
    },
    asset_url: {
        type: DataTypes.STRING(255),
        allowNull: false // Путь к картинке птички на бэкенде
    }
}, { tableName: 'Skin' });


export const UserSkin = sequelize.define("UserSkin", {
    id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        autoIncrement: true,
        primaryKey: true
    },
    id_User: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'User', key: 'id' }
    },
    id_Skin: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'Skin', key: 'id' }
    }
}, { tableName: 'UserSkin' });

// Связи для работы через Sequelize методы (например, User.addSkin(skin))
User.belongsToMany(Skin, { through: UserSkin, foreignKey: 'id_User' });
Skin.belongsToMany(User, { through: UserSkin, foreignKey: 'id_Skin' });


export const EvolutionRun = sequelize.define("EvolutionRun", {
    id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        autoIncrement: true,
        primaryKey: true
    },
    id_User: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: 'User', // Имя таблицы создателя симуляции
            key: 'id'
        },
        onDelete: 'CASCADE', // Если юзер удалится, удалится и история его запусков ИИ
        onUpdate: 'CASCADE'
    },
    max_generation: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
        comment: "До какого поколения дошла симуляция"
    },
    best_score: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: "Лучший результат (счет) среди всех птиц в этом запуске"
    },
    weights_data: {
        type: DataTypes.JSON, // Идеально подходит для конфигурации слоев и весов ИИ
        allowNull: false,
        comment: "Массивы весов, смещений и структура лучшей нейросети"
    }
}, { 
    tableName: 'EvolutionRun',
});

// Настройка ассоциаций для Sequelize запросов
EvolutionRun.belongsTo(User, { foreignKey: 'id_User' });
User.hasMany(EvolutionRun, { foreignKey: 'id_User' });
