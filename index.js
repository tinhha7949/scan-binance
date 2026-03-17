const express = require("express");
const fetch = require("node-fetch");

const app = express();

let signals = [];
let lastUpdate = "";

// ===== API =====
app.get("/api", (req, res) => {
  res.json({ signals, lastUpdate });
});

app.get("/scan", async (req, res) => {
  await scan();
  res.send("ok");
});

// ===== UI =====
app.get("/", (req, res) => {
  res.send(`
  <html>
  <head>
    <title>Scanner</title>
    <style>
      body{background:#0f172a;color:#fff;font-family:Arial;padding:20px}
      button{padding:10px;background:#38bdf8;border:none;border-radius:6px}
      .card{background:#020617;padding:10px;margin:10px 0;border-radius:8px}
      .long{color:#22c55e}
      .short{color:#ef4444}
    </style>
  </head>
  <body>

  <h2>🚀 FUTURE SCANNER</h2>
  <button onclick="scanNow()">Scan lại</button>
  <p>Last: <span id="time"></span></p>
  <div id="list"></div>

  <script>
  async function load(){
    let res = await fetch("/api");
    let d = await res.json();

    document.getElementById("time").innerText = d.lastUpdate;

    let html = "";

    d.signals.forEach(function(c){
      html += '<div class="card">'
      + '<b>'+c.symbol+'</b><br>'
      + '<span class="'+(c.side==="LONG"?"long":"short")+'">'+c.side+'</span><br>'
      + 'Entry: '+c.price.toFixed(4)+'<br>'
      + 'TP: '+c.tp.toFixed(4)+'<br>'
      + 'SL: '+c.sl.toFixed(4)+'<br>'
      + 'Score: '+c.score
      + '</div>';
    });

    document.getElementById("list").innerHTML = html;
  }

  async function scanNow(){
    await fetch("/scan");
    load();
  }

  load();
  setInterval(load,5000);
  </script>

  </body>
  </html>
  `);
});

// ===== SERVER =====
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("RUNNING PORT", PORT));

// ===== BOT =====
async function scan(){

  let coins = ["BTCUSDT","ETHUSDT","SOLUSDT"];

  function ema(arr,p){
    let k=2/(p+1),e=arr[0];
    for(let i=1;i<arr.length;i++) e=arr[i]*k+e*(1-k);
    return e;
  }

  function rsi(arr,p=14){
    let g=0,l=0;
    for(let i=arr.length-p;i<arr.length;i++){
      let d=arr[i]-arr[i-1];
      if(d>=0) g+=d; else l-=d;
    }
    let rs=g/(l||1);
    return 100-(100/(1+rs));
  }

  async function getData(symbol){
    try{
      let url = "https://fapi.binance.com/fapi/v1/klines?symbol="+symbol+"&interval=15m&limit=200";
      let res = await fetch(url);
      return await res.json();
    }catch{
      return null;
    }
  }

  let results=[];

  for(let symbol of coins){
    let data=await getData(symbol);
    if(!data) continue;

    let closes=data.map(x=>parseFloat(x[4]));
    let price=closes[closes.length-1];

    let e20=ema(closes.slice(-40),20);
    let e50=ema(closes.slice(-80),50);

    let r=rsi(closes);

    let side=null,score=0;

    if(e20>e50){side="LONG";score+=60}
    if(e20<e50){side="SHORT";score+=60}

    if(side==="LONG"&&r>50)score+=20;
    if(side==="SHORT"&&r<50)score+=20;

    if(score>=80){
      let tp=side==="LONG"?price*1.05:price*0.95;
      let sl=side==="LONG"?price*0.985:price*1.015;

      results.push({symbol,side,price,tp,sl,score});
    }
  }

  signals = results;
  lastUpdate = new Date().toLocaleTimeString();
}

// chạy liên tục
scan();
setInterval(scan,300000);
