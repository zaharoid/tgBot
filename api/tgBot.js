import { Telegraf } from 'telegraf';
import pg from 'pg';
import cron from 'node-cron';
import express from 'express';

const { Pool } = pg;

const bot = new Telegraf('7112921568:AAFW6hSYA9ZOUrlikLGyZP0DXt-uwlJ5i_E');

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'postgres',
  password: '123456',
  port: 5432,
});

bot.start((ctx) => {
  ctx.reply('Привет! Я запущен и готов к работе.');
});

const updateCurrencyFunction = async () => {
  try {
      await client.query('CALL update_currency();');
      console.log('Currency update completed successfully');
  } catch (error) {
      console.error('Error updating currency:', error);
  }
};

// Запуск задачи cron для выполнения функции каждый день в полночь
cron.schedule('0 0 * * *', () => {
  updateCurrencyFunction();
});

bot.command('help', (ctx) => {
  const helpMessage = `
  Доступные команды:
  /total_gdp_for_car_brand <марка автомобиля> - Какой суммарный ВВП стран, которые входят в континент, выпускающих автомобиль данной марки.
  /cars_of_continent_by_country <страна> - Какие автомобили выпускались континентом, в который входит данная страна.
  /total_area_by_cylinders <количество цилиндров> - Какова суммарная площадь стран, входящих в континент, выпускающий автомобили с указанным количеством цилиндров.
  /countries_by_horsepower <more/less> <лошадиные силы> - Какие страны входят в континент, выпускающий автомобили мощностью более/менее указанного значения.
  /country_heaviest_car_currency <heaviest / fastest> <cheapest / most_expensive> - Какая из стран, входящих в континент стран, выпускающих самый тяжелый/быстрый автомобиль, имеет самую дешевую/дорогую валюту.
  `;
  ctx.reply(helpMessage);
});

async function getTotalGDPForCarBrand(carBrand) {
  const query = `
    WITH selected_continent AS (
      SELECT DISTINCT continent
      FROM cars
      WHERE car = $1
    ),
    unique_countries AS (
      SELECT DISTINCT countries.Country, countries.GDP
      FROM countries
      JOIN cars ON countries.Country = cars.origin
      WHERE cars.continent IN (SELECT continent FROM selected_continent)
    )
    SELECT SUM(GDP) AS total_gdp
    FROM unique_countries;
  `;

  try {
    const result = await pool.query(query, [carBrand]);
    if (result.rows.length > 0) {
      return result.rows[0].total_gdp;
    } else {
      return null;
    }
  } catch (error) {
    console.error('Ошибка выполнения запроса:', error);
    return null;
  }
}

// Обработчик команды /total_gdp_for_car_brand
bot.command('total_gdp_for_car_brand', async (brand) => {
    const carBrand = brand.message.text.split(' ').slice(1).join(' ');

    if (!carBrand) {
      brand.reply('Пожалуйста, укажите марку автомобиля после команды /total_gdp_for_car_brand.');
      return;
    }

  getTotalGDPForCarBrand(carBrand).then(totalGDP => {
    if (!totalGDP) {
      return brand.reply(`У нас нет информации по марке ${carBrand}`);
    }
    brand.reply(`Суммарный ВВП стран, выпускающих автомобили марки ${carBrand}: ${totalGDP}$`);
  }).catch(error => {
    console.error('Ошибка:', error);
  });
});

// Обработчик команды /cars_of_continent_by_country
bot.command('cars_of_continent_by_country', async (ctx) => {
  try {
    const country = ctx.message.text.split(' ')[1];
    const query = `
      SELECT DISTINCT car
      FROM cars
      WHERE continent = (
        SELECT continent
        FROM cars
        WHERE origin = $1
        LIMIT 1
      );
    `;
    if (!country?.trim()) return ctx.reply(`Введите название страны!`);
    const result = await pool.query(query, [country]);
    if (result.rows.length > 0) {
      const carsList = result.rows.map(row => row.car).join('\n');
      ctx.reply(`Автомобили, выпускавшиеся континентом, в который входит страна ${country}: \n${carsList}`);
    } else {
      ctx.reply(`Нет данных об автомобилях для страны ${country}.`);
    }
  } catch (error) {
    console.error('Ошибка:', error);
    ctx.reply('Произошла ошибка при выполнении запроса.');
  }
});
async function getAreaByCylinders(cylinderCount) {
  try {
    // Проверка входных данных
    const allowedCylinders = [3, 4, 5, 6, 8];
    
    // Проверяем, является ли входное значение строкой
    if (typeof cylinderCount !== 'string') {
      return 'Некорректное значение количества цилиндров. Пожалуйста, введите число.';
    }

    // Проверяем, содержит ли строка только числовые символы
    if (!/^\d+$/.test(cylinderCount)) {
      return 'Некорректное значение количества цилиндров. Пожалуйста, введите число.';
    }

    // Преобразуем строку в число
    const cylinders = parseInt(cylinderCount, 10);
    
    // Проверяем, входит ли число в список допустимых значений
    if (!allowedCylinders.includes(cylinders)) {
      return 'Некорректное значение количества цилиндров. Пожалуйста, введите одно из следующих значений: 3, 4, 5, 6, 8.';
    }

    // SQL-запрос для получения суммарной площади стран по количеству цилиндров
    const query = `
      SELECT SUM(countries.area) AS total_area
      FROM countries
      WHERE country IN (
          SELECT DISTINCT origin
          FROM cars
          WHERE cylinders = $1
      );
    `;
    
    // Выполнение запроса к базе данных
    const result = await pool.query(query, [cylinders]);

    // Возвращаем суммарную площадь стран
    return `Суммарная площадь стран, выпускающих ${cylinders}-цилиндровые автомобили: ${result.rows[0].total_area}`;
  } catch (error) {
    console.error('Ошибка:', error);
    throw new Error('Произошла ошибка при выполнении запроса. Пожалуйста, попробуйте еще раз.');
  }
}

// Обработчик команды /total_area_by_cylinders
bot.command('total_area_by_cylinders', async (ctx) => {
  try {
    const input = ctx.message.text.split(' ')[1]; // Получаем ввод пользователя
    const message = await getAreaByCylinders(input); // Вызываем функцию для расчета

    // Отправляем результат или сообщение об ошибке обратно пользователю
    ctx.reply(message);
  } catch (error) {
    console.error('Ошибка при выполнении запроса:', error.message);
    ctx.reply('Произошла ошибка при выполнении запроса. Пожалуйста, попробуйте еще раз.');
  }
});


async function getCountriesByHorsepower(comparison, horsepowerLimit) {
  try {
    if (comparison !== 'more' && comparison !== 'less') {
      return 'Некорректные параметры. Пожалуйста, введите тип сравнения ("more" или "less").';
    }

    const operator = comparison === 'more' ? '>' : '<';

    const query = `
      SELECT DISTINCT country
      FROM countries
      WHERE country IN (
          SELECT origin
          FROM cars
          WHERE horsepower ${operator} $1
      );
    `;
    
    const result = await pool.query(query, [horsepowerLimit]);

    if (result.rows.length > 0) {
      const countries = result.rows.map(row => row.country).join(', ');
      return `Страны, входящие в континент, выпускающий автомобили мощностью ${comparison === 'more' ? 'более' : 'менее'} ${horsepowerLimit} лошадиных сил: ${countries}`;
    } else {
      return `Нет стран, выпускающих автомобили мощностью ${comparison === 'more' ? 'более' : 'менее'} ${horsepowerLimit} лошадиных сил.`;
    }
  } catch (error) {
    console.error('Ошибка:', error);
    throw new Error('Произошла ошибка при выполнении запроса. Пожалуйста, попробуйте еще раз.');
  }
}

// Обработчик команды /countries_by_horsepower
bot.command('countries_by_horsepower', async (ctx) => {
  try {
    const args = ctx.message.text.split(' ');
    if (args.length !== 3) {
      return ctx.reply('Некорректный формат команды. Используйте: /countries_by_horsepower <more/less> <horsepower>');
    }

    const comparison = args[1];
    const horsepowerLimit = parseInt(args[2], 10);

    if (isNaN(horsepowerLimit)) {
      return ctx.reply('Некорректное значение мощности. Введите число.');
    }

    const message = await getCountriesByHorsepower(comparison, horsepowerLimit);

    ctx.reply(message);
  } catch (error) {
    console.error('Ошибка при выполнении запроса:', error.message);
    ctx.reply('Произошла ошибка при выполнении запроса. Пожалуйста, попробуйте еще раз.');
  }
});

// Обработчик команды /country_heaviest_car_currency
bot.command('country_heaviest_car_currency', async (ctx) => {
  try {
    const inputParams = ctx.message.text.split(' ').slice(1);
    if (inputParams.length !== 2) {
      ctx.reply('Пожалуйста, введите два параметра: характеристика автомобиля (heaviest / fastest) и тип валюты (cheapest / most_expensive).');
      return;
    }

    const carCharacteristic = inputParams[0];
    const currencyType = inputParams[1];

    if (!['heaviest', 'fastest'].includes(carCharacteristic) || !['cheapest', 'most_expensive'].includes(currencyType)) {
      ctx.reply('Неверно указаны параметры. Используйте "heaviest" или "fastest" для характеристики автомобиля и "cheapest" или "most_expensive" для типа валюты.');
      return;
    }

    let query = `
      SELECT cic.country
      FROM cars c
      JOIN countries cic ON c.origin = cic.country
      WHERE c.weight = (
        SELECT ${carCharacteristic === 'heaviest' ? 'MAX' : 'MIN'}(c2.weight)
        FROM cars c2
        WHERE c2.continent = c.continent
      )
      ORDER BY c.weight ${carCharacteristic === 'heaviest' ? 'DESC' : 'ASC'}
      LIMIT 1;
    `;

    const { rows } = await pool.query(query);

    if (rows.length > 0) {
      const resultCountry = rows[0].country;
      ctx.reply(`Страна, выпускающая ${carCharacteristic === 'heaviest' ? 'самый тяжелый' : 'самый быстрый'} автомобиль и имеющая ${currencyType === 'cheapest' ? 'самую дешевую' : 'самую дорогую'} валюту: ${resultCountry}`);
    } else {
      ctx.reply(`Информация не найдена.`);
    }

  } catch (error) {
    console.error('Ошибка при выполнении запроса:', error);
    ctx.reply('Произошла ошибка при выполнении запроса.');
  }
});


bot.on('message', (ctx) => {
  ctx.reply('Не знаю такой комманды...');
});

const app = express();

bot.start((ctx) => ctx.reply('Привет! Я бот на Vercel.'));

bot.telegram.setWebhook('https://tg-ms4n0dse9-zaharoids-projects.vercel.app');
app.use(bot.webhookCallback('/api/tgBot'));

app.get('/', (req, res) => {
  res.send('Этот бот работает на Vercel!');
});


bot.launch().then(() => {
  console.log('Запустился');
}).catch((err) => {
  console.error('err:', err);
});

export default app;