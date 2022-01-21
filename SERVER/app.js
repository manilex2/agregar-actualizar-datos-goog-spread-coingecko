require('dotenv').config();
const express = require('express');
const app = express();
const morgan = require('morgan');
const fetch = require('node-fetch');
const PUERTO = 4300;
const {google} = require('googleapis');
const auth = new google.auth.GoogleAuth({
    keyFile: "credentials.json",
    scopes: "https://www.googleapis.com/auth/spreadsheets"
});
const spreadsheetId = process.env.SPREADSHEET_ID;
const client = auth.getClient();
const googleSheet = google.sheets({ version: 'v4', auth: client });

app.use(morgan("dev"));

app.get("/", async (consulta, respuesta) => {
    fetch('https://api.coingecko.com/api/v3/ping').then((res) => {
        if (res.status >= 200 && res.status<300) {
            respuesta.send('<h2 style="color: green;">Conexión con CoinGecko establecida.</h2>');
            //var idcoin = solicitud.params.idcoin;
            obtenerCoins();
        }else if(res.status >= 100 && res.status<200) {
            respuesta.send('<h2 style="color: blue;">Todo parece estar bien, continue</h2>');
        }else if(res.status >= 300 && res.status<400) {
            respuesta.send('<h2 style="color: yellow;">Se está redireccionando el contenido</h1>');
        }else if(res.status >= 400 && res.status<500) {
            respuesta.send('<h2 style="color: red;">Se está consultando un contenido inválido, revise nuevamente.</h2>');
        }else if(res.status >= 500 && res.status<600) {
            respuesta.send('<h2 style="color: white; background-color: black;">Error en los servidores de CoinGecko, intente más tarde</h2>');
        }else {
            respuesta.send('Error desconocido');
        }
    });
    async function obtenerCoins() {
        var idCoins = [];
        try {
            var request = (await googleSheet.spreadsheets.values.get({
                auth,
                spreadsheetId,
                range: `${process.env.NOMBRE_HOJA}!A2:A`
            })).data;
            await fetch('https://api.coingecko.com/api/v3/coins/list').then((res) => {
                return res.json();
            }).then((json) => {
                var coins = json;
                for (let i = 0; i < coins.length; i++) {
                    idCoins.push(coins[i].id);
                }
                if(request.values === undefined){
                    request.values = [0];
                }
                if(request.values.length != idCoins.length){
                    guardarListaCoins(idCoins);
                }else{
                    obtenerPrecios(request);
                }
            });
        } catch (error) {
            console.error(error);
        }
        
        async function guardarListaCoins(idCoins) {
            try {
                (await googleSheet.spreadsheets.values.clear({
                    auth,
                    spreadsheetId,
                    range: `${process.env.NOMBRE_HOJA}!A2:A`,
                }));
                (await googleSheet.spreadsheets.values.append({
                    auth,
                    spreadsheetId,
                    range: `${process.env.NOMBRE_HOJA}!A2:A`,
                    insertDataOption: "OVERWRITE",
                    valueInputOption: "USER_ENTERED",
                    requestBody: {
                        "majorDimension": "COLUMNS",
                        "range": `${process.env.NOMBRE_HOJA}!A2:A`,
                        "values": [idCoins]
                    }
                })).data;
                console.log("Agregados " + idCoins.length + " coins a la lista");
                var request = (await googleSheet.spreadsheets.values.get({
                    auth,
                    spreadsheetId,
                    range: `${process.env.NOMBRE_HOJA}!A2:A`
                })).data;
                obtenerPrecios(request);
            } catch (error) {
                console.error(error);
            }
        }
        async function obtenerPrecios(request){
            var ini = 0;
            var total = request.values.length;
            var extDatos = Math.floor(request.values.length/process.env.CANTIDAD_CONSULTAS);
            const extDatosConst = extDatos;
            var criptos = [];
            var precios = [];
            var coinsDesglozados = [];
            var datos = [];
            try {
                while (extDatos <= total) {
                    coinsDesglozados = [];
                    for (ini; ini < extDatos; ini++) {
                        coinsDesglozados.push(request.values[ini]);
                    }
                    await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${coinsDesglozados}&vs_currencies=usd`).then((res) => {
                        return res.json();
                    }).then((json) => {
                        let respuesta = json;
                        for (var coin in respuesta) {
                            criptos.push(coin);
                            if (Object.keys(respuesta[coin]).length === 0) {
                                precios.push(0);
                            } else {
                                for (var moneda in respuesta[coin]) {
                                    precios.push(respuesta[coin][moneda]);
                                }
                            }
                        }
                        if(criptos.length == coinsDesglozados.length*process.env.CANTIDAD_CONSULTAS && precios.length == coinsDesglozados.length*process.env.CANTIDAD_CONSULTAS) {
                            guardarDatosFetch(criptos, precios);
                        }
                    }).catch((error) => {
                        console.error(error);
                    });
                    extDatos = extDatosConst + extDatos;
                }                
            } catch (error) {
                console.error(error);
            }
            async function guardarDatosFetch(criptos, precios){
                extDatos = extDatosConst + extDatos;
                ini = criptos.length;
                try {
                    if (extDatos > total) {
                        extDatos = total;
                        coinsDesglozados = [];
                        for (ini; ini < extDatos; ini++) {
                            coinsDesglozados.push(request.values[ini]);
                        }
                        await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${coinsDesglozados}&vs_currencies=usd`).then((res) => {
                            return res.json();
                        }).then((json) => {
                            let respuesta = json;
                            for (var coin in respuesta) {
                                criptos.push(coin);
                                if (Object.keys(respuesta[coin]).length === 0) {
                                    precios.push(0);
                                } else {
                                    for (var moneda in respuesta[coin]) {
                                        precios.push(respuesta[coin][moneda]);
                                    }
                                }
                            }
                            if(criptos.length == total && precios.length == total) {
                                datos.push(criptos, precios);
                                agregarPreciosFinales(datos);
                            }
                        }).catch((error) => {
                            console.error(error);
                        });
                        extDatos = extDatosConst + extDatos;
                    }    
                } catch (error) {
                    console.error(error);
                }
            }
        }
        async function agregarPreciosFinales(datos) {
            try {
                (await googleSheet.spreadsheets.values.update({
                    auth,
                    spreadsheetId,
                    range: `${process.env.NOMBRE_HOJA}!A2:B`,
                    valueInputOption: "USER_ENTERED",
                    requestBody: {
                        "majorDimension": "COLUMNS",
                        "range": `${process.env.NOMBRE_HOJA}!A2:B`,
                        "values": datos
                    }
                })).data;
                console.log(`Se actualizaron ${datos[0].length} coins`);
            } catch (error) {
                console.error(error);
            }
        }
    }
});

app.listen(PUERTO || process.env.PORT, () => {
    console.log("Servidor funcionando en el puerto " + PUERTO || process.env.PORT)
});