const express = require("express");
const fetch = require("node-fetch");

const app = express();

let signals = [];
let lastUpdate = "";

// API trả dữ liệu
app.get("/api", (req, res) => {
  res.json({ signals, lastUpdate });
});

// UI đẹp
app.get("/", (req, res) => {
  res.send(`
  <html>
  <head>
    <title>Future Scanner Pro</title>
    <style>
      body {
        background: #0f172a;
        color: #e2e8f0;
        font-family: Arial;
        padding: 20px;
      }
      h1 {
        color: #38bdf8;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 20px;
      }
      th, td {
        padding: 10px;
        text-align: center;
      }
      th {
        background: #1e293b;
      }
      tr {
        border-bottom: 1px solid #1e293b;
      }
      .long {
        color: #22c55e;
        font-weight: bold;
      }
      .short {
        color: #ef4444;
        font-weight: bold;
      }
      .card {
        background: #020617;
        padding: 15px;
        border-radius: 10px;
      }
    </style>
  </head>
  <body>
    <h1>🚀 FUTURE SCANNER PRO</h1>
    <div class="card">
      <div>Last update: <span id="time">...</span></div>
      <table>
        <thead>
          <tr>
            <th>Coin</th>
            <th>Side</th>
            <th>Entry</th>
            <th>TP</th>
            <th>SL</th>
            <th>Score</th>
          </tr>
        </thead>
        <tbody id="data"></tbody>
      </table>
    </div>

    <script>
      async function load(){
        let res = await fetch("/api");
        let d = await res.json();

        document.getElementById("time").innerText = d.lastUpdate;

        let html = "";
        d.signals.forEach(c=>{
          html += \`
          <tr>
            <td>\${c.symbol}</td>
            <td class="\${c.side==="LONG"?"long":"short"}">\${c.side}</td>
            <td>\${c.price.toFixed(4)}</td>
            <td>\${c.tp.toFixed(4)}</td>
            <td>\${c.sl.toFixed(4)}</td>
            <td>\${c.score}</td>
          </tr>
          \`;
        });

        document.getElementById("data").innerHTML = html;
      }

      load();
      setInterval(load, 5000);
    </script>
  </body>
  </html>
  `);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server chạy cổng", PORT));

// ================= BOT =================

async function scan(){

  console.log("🚀 SCAN...");

  let coins = [
    "BTCUSDT","ETHUSDT","SOLUSDT","BNBUSDT","XRPUSDT",
    "ADAUSDT","AVAXUSDT","DOGEUSDT","LINKUSDT","DOTUSDT"
  ];

  function ema(arr, p){
    let k=2/(p+1);
    let e=arr[0];
    for(let i=1;i<arr.length;i++){
      e=arr[i]*k+e*(1-k);
    }
    return e;
  }

  function rsi(arr,p=14){
    let g=0,l=0;
    for(let i=arr.length-p;i<arr.length;i++){
      let d=arr[i]-arr[i-1];
      if(d>=0) g+=d;
      else l-=d;
    }
    let rs=g/(l||1);
    return 100-(100/(1+rs));
  }

  async function getData(symbol){
    try{
      let url= `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=15m&limit=200`;
      let res=await fetch(url);
      if(!res.ok) return null;
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
    let price=closes.at(-1);

    let ema20=ema(closes.slice(-40),20);
    let ema50=ema(closes.slice(-80),50);

    let r=rsi(closes);

    let side=null;
    let score=0;

    if(ema20>ema50){
      side="LONG"; score+=60;
    }

    if(ema20<ema50){
      side="SHORT"; score+=60;
    }

    if(side==="LONG" && r>50) score+=20;
    if(side==="SHORT" && r<50) score+=20;

    if(score>=80){
      let tp = side==="LONG" ? price*1.05 : price*0.95;
      let sl = side==="LONG" ? price*0.985 : price*1.015;

      results.push({symbol,side,price,tp,sl,score});
    }
  }

  results.sort((a,b)=>b.score-a.score);

  signals = results.slice(0,10);
  lastUpdate = new Date().toLocaleTimeString();
}

// chạy liên tục
scan();
setInterval(scan, 300000);
