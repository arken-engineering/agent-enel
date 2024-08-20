import _ from 'lodash';
import { AgentBase, BaseAgentData, Schedule } from '../../agent';
import axios from 'axios';
import dayjs from 'dayjs';
import { sleep } from '@arken/node/util/time';

interface InitParams {
  cerebro: any;
  model: any;
}

export async function init({ cerebro, model }: InitParams) {
  const agent = new Agent(cerebro, model);

  log('Initializing');

  await agent.init();

  log('Initialized');

  return agent;
}

let log: (...msgs: any[]) => void;
let app: any;

interface EnelData extends BaseAgentData {
  personality: string[];
  schedule: {
    getWeather: Schedule;
    getAirQuality: Schedule;
    getPeriodicAirQualityScreenshot: Schedule;
  };
}

class Agent extends AgentBase<EnelData> {
  constructor(cerebro: any, model: any) {
    super('Enel', cerebro, model, {
      personality: ['analytical', 'observant', 'detailed'],
      schedule: {
        getWeather: {
          delay: '1h',
          interval: '1d',
          processedDate: null,
        },
        getAirQuality: {
          delay: '2h',
          interval: '1d',
          processedDate: null,
        },
        getPeriodicAirQualityScreenshot: {
          delay: '1m',
          interval: '1h',
          processedDate: null,
        },
      },
    } as Partial<EnelData>);

    log = this.log.bind(this);
    app = this.app;
  }

  async init() {
    super.init();

    app.channel.request.subscribe(this.onRequest.bind(this));
  }

  async onRequest({ req, res }: { req: any; res: any }) {
    // Implement onRequest logic if needed
  }

  async getWeather() {
    const url = `https://api.openweathermap.org/data/2.5/weather?q=${process.env.WEATHER_CITY},CA&appid=${process.env.OPENWEATHERMAP_API_KEY}&units=metric`;

    try {
      const response = await axios(url);
      if (!response.data) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = response.data;
      const description = `${Math.round(data.main.temp)} degrees ${data.weather[0].description} (${
        data.clouds.all
      }% clouds) (${data.main.humidity}% humidity)`;

      return {
        description,
        data,
      };
    } catch (error) {
      console.error('Error fetching weather data:', error);
    }
  }

  async getPeriodicAirQualityScreenshot() {
    log('Get periodic air quality screenshot');

    const url = 'https://map.purpleair.com/1/mAQI/a60/p604800/cC0#1.8/42.3/166.1';

    const browser = await app.util.browser.open();
    try {
      const page = await app.util.browser.newPage(browser, url, {
        log,
      });
      await sleep(15 * 1000);

      await page.click('#gdpr-cookie-accept');
      await page.click('.sensorsCloseButton');

      await sleep(1 * 1000);
      await page.screenshot({
        path: 'saved/sites/purpleair/' + dayjs().format('YYYY-MM-DD_HH-mm-ss') + '.png',
        fullPage: true,
      });
      log('Screenshot air quality');
    } catch (e) {
      log('Error', ['alert', 'p10'], e);
    } finally {
      await browser.close();
    }
  }

  async getAirQuality() {
    const url = `https://api.purpleair.com/v1/sensors?location_type=0&nwlng=${process.env.WEATHER_NW_LNG}&selng=${process.env.WEATHER_SE_LNG}&nwlat=${process.env.WEATHER_NW_LAT}&selat=${process.env.WEATHER_SE_LAT}&api_key=${process.env.PURPLEAIR_API_KEY}&fields=pm2.5_atm,temperature,humidity`;

    try {
      const response = await axios(url);
      if (!response.data) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = response.data;

      // Extract and log relevant air quality data
      if (data.data && data.data.length > 0) {
        const pm25 = app.util.math.average(...data.data.map((s: any) => s[3]));

        return {
          pm25,
          data: data.data,
        };
      } else {
        console.log('No sensor data available.');
      }
    } catch (error) {
      console.error('Error fetching air quality data:', error);
    }
  }
}
