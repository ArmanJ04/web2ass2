const express = require("express");
const https = require("https");
const bodyParser = require("body-parser");
const request = require('request');

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));

app.use("/leaflet", express.static("node_modules/leaflet/dist"));
app.get("/", function (req, res) {
    res.sendFile(__dirname + "/index.html");
});

app.all("/", function (req, res) {
    const city = req.body.city || "Astana";
    const openWeatherMapApiKey = '1440a81f89afb0a2eda2045fd09454fb';
    const weatherApiApiKey = '1226122d368f4156b8d130312242101';
    const ciApiKey = 'FJiT4b3NW8ar50vc8bKGmg==HE78LsXRHeCE4WgM';

    function fetchData(url, callback) {
        https.get(url, function (response) {
            let data = "";
            response.on("data", function (chunk) {
                data += chunk;
            });
            response.on("end", function () {
                callback(null, JSON.parse(data));
            });
        }).on("error", function (error) {
            callback(error, null);
        });
    }

    const openWeatherMapUrl = `https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${openWeatherMapApiKey}&units=metric`;
    fetchData(openWeatherMapUrl, function (openWeatherMapError, openWeatherMapData) {
        if (openWeatherMapError) {
            console.error("Error fetching weather data from OpenWeatherMap:", openWeatherMapError.message);
            return res.status(500).send("Error fetching weather data from OpenWeatherMap");
        }

        const timezoneUrl = `https://api.timezonedb.com/v2.1/get-time-zone?key=9ATBD9RC3R6W&format=json&by=position&lat=${openWeatherMapData.coord.lat}&lng=${openWeatherMapData.coord.lon}`;
        fetchData(timezoneUrl, function (timezoneError, timezoneData) {
            if (timezoneError) {
                console.error("Error fetching timezone data:", timezoneError.message);
                return res.status(500).send("Error fetching timezone data");
            }

            try {
                const timezoneName = timezoneData.zoneName;
                const weatherInfo = {
                    city,
                    temperature: openWeatherMapData.main.temp,
                    feelsLike: openWeatherMapData.main.feels_like,
                    description: openWeatherMapData.weather[0].description,
                    icon: openWeatherMapData.weather[0].icon,
                    coordinates: `${openWeatherMapData.coord.lat}, ${openWeatherMapData.coord.lon}`,
                    humidity: openWeatherMapData.main.humidity,
                    pressure: openWeatherMapData.main.pressure,
                    windSpeed: openWeatherMapData.wind.speed,
                    countryCode: openWeatherMapData.sys.country,
                    rainVolume: openWeatherMapData.rain ? openWeatherMapData.rain["1h"] || 0 : 0,
                    timezone: timezoneName,
                };

                res.write("<style>table { border-collapse: collapse; width: 100%; margin-bottom: 20px; } table, th, td { border: 1px solid #ddd; } th, td { padding: 15px; text-align: left; }</style>");
                res.write("<h1>Weather Information</h1>");
                res.write("<table>");
                for (const [key, value] of Object.entries(weatherInfo)) {
                    if (key === "icon") {
                        res.write(`<tr><th>${key}</th><td><img src='https://openweathermap.org/img/wn/${value}.png' alt='Weather Icon'></td></tr>`);
                    } else {
                        res.write(`<tr><th>${key}</th><td>${value}</td></tr>`);
                    }
                }
                res.write("</table>");
                

                const cityApiUrl = `https://api.api-ninjas.com/v1/city?name=${city}`;
                request({
                    url: cityApiUrl,
                    headers: {
                        'X-Api-Key': ciApiKey,
                    },
                }, function(cityError, cityResponse, cityBody) {
                    if (cityError) {
                        console.error("Error fetching city data:", cityError.message);
                        return res.status(500).send("Error fetching city data");
                    }

                    try {
                        const cityInfo = JSON.parse(cityBody);
                        const population = cityInfo[0].population;
                        const isCapital = cityInfo[0].is_capital;

                        res.write("<h2>City Information</h2>");
                        res.write("<table>");
                        res.write(`<tr><th>Population</th><td>${population}</td></tr>`);
                        res.write(`<tr><th>Is Capital</th><td>${isCapital ? 'Yes' : 'No'}</td></tr>`);
                        res.write("</table>");

                        res.write('<div id="map" style="height: 400px; margin-top: 20px;"></div>');
                        res.write('<link rel="stylesheet" href="/leaflet/leaflet.css">');
                        res.write('<script src="/leaflet/leaflet.js"></script>');

                        res.write(`
                            <script>
                                var map = L.map('map').setView([${openWeatherMapData.coord.lat}, ${openWeatherMapData.coord.lon}], 13);
                                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                                    attribution: '© OpenStreetMap contributors'
                                }).addTo(map);
                                L.marker([${openWeatherMapData.coord.lat}, ${openWeatherMapData.coord.lon}]).addTo(map)
                                    .bindPopup('${city}')
                                    .openPopup();
                            </script>
                        `);

                        const weatherApiUrl = `https://api.weatherapi.com/v1/forecast.json?key=${weatherApiApiKey}&q=${city}&days=14&units=metric`;
                        fetchData(weatherApiUrl, function (weatherApiError, weatherApiData) {
                            if (weatherApiError) {
                                console.error("Error fetching weather data from WeatherAPI:", weatherApiError.message);
                                return res.status(500).send("Error fetching weather data from WeatherAPI");
                            }
                            res.write("<h2>14-Day Forecast</h2>");
                            res.write("<table>");
                            res.write("<tr><th>Date</th><th>Max Temperature</th><th>Min Temperature</th><th>Wind Direction</th><th>Sunrise</th><th>Sunset</th></tr>");
                            weatherApiData.forecast.forecastday.forEach(day => {
                                res.write(`<tr><td>${day.date}</td><td>${day.day.maxtemp_c}°C</td><td>${day.day.mintemp_c}°C</td><td>${day.day.avgvis_km}</td><td>${day.astro.sunrise}</td><td>${day.astro.sunset}</td></tr>`);
                            });
                            res.write("</table>");

                            res.send();
                        });

                    } catch (error) {
                        console.error("Error parsing city data:", error.message);
                        res.status(500).send("Error parsing city data");
                    }
                });
            } catch (error) {
                console.error("Error parsing timezone data:", error.message);
                res.status(500).send("Error parsing timezone data");
            }
        });
    });
});

app.listen(3000, function () {
    console.log("Server is running on port 3000");
});
