#ifndef MT5_CORE_TRADE_EXECUTION_MQH
#define MT5_CORE_TRADE_EXECUTION_MQH
#include <Trade/Trade.mqh>

// Transport to the broker only. No signals, indicators or entry timing rules.
class CTradeExecution
{
private:
   CTrade trade;
   bool enabled;

   bool Reject(string message)
   { Print("MT5 trade rejected locally: ",message); return false; }

public:
   CTradeExecution() { enabled=false; }

   void Configure(bool allow_orders,ulong magic,ulong deviation)
   {
      enabled=allow_orders;
      trade.SetExpertMagicNumber(magic);
      trade.SetDeviationInPoints(deviation);
      trade.SetAsyncMode(false);
   }

   // Caller must decide side, volume, stop loss and take profit in a future strategy.
   // sl/tp are absolute prices; 0 means no stop/take-profit instruction.
   // true = broker accepted the request, not proof of a fully filled position.
   bool SubmitMarket(ENUM_ORDER_TYPE side,string symbol,double volume,
                     double sl=0,double tp=0,string comment="MT5Core")
   {
      if(!enabled) return Reject("EnableOrders is false");
      if(side!=ORDER_TYPE_BUY && side!=ORDER_TYPE_SELL) return Reject("market BUY/SELL only");
      if(!TerminalInfoInteger(TERMINAL_CONNECTED)) return Reject("terminal disconnected");
      if(!TerminalInfoInteger(TERMINAL_TRADE_ALLOWED) || !MQLInfoInteger(MQL_TRADE_ALLOWED) ||
         !AccountInfoInteger(ACCOUNT_TRADE_ALLOWED) || !AccountInfoInteger(ACCOUNT_TRADE_EXPERT))
         return Reject("automated trading permission missing");
      if(!SymbolSelect(symbol,true)) return Reject("unknown/unavailable symbol");
      if(!MathIsValidNumber(volume) || !MathIsValidNumber(sl) || !MathIsValidNumber(tp) ||
         volume<=0 || sl<0 || tp<0) return Reject("invalid volume or prices");

      double step=SymbolInfoDouble(symbol,SYMBOL_VOLUME_STEP);
      double minlot=SymbolInfoDouble(symbol,SYMBOL_VOLUME_MIN);
      double maxlot=SymbolInfoDouble(symbol,SYMBOL_VOLUME_MAX);
      if(step<=0 || volume<minlot || volume>maxlot ||
         MathAbs(volume/step-MathRound(volume/step))>0.000001)
         return Reject("volume does not match broker limits/step");

      MqlTick tick;
      if(!SymbolInfoTick(symbol,tick) || tick.ask<=0 || tick.bid<=0 || tick.ask<tick.bid)
         return Reject("no usable quote");
      double point=SymbolInfoDouble(symbol,SYMBOL_POINT);
      double ticksize=SymbolInfoDouble(symbol,SYMBOL_TRADE_TICK_SIZE);
      if(point<=0 || ticksize<=0) return Reject("invalid symbol price specification");
      if((sl>0 && MathAbs(sl/ticksize-MathRound(sl/ticksize))>0.00001) ||
         (tp>0 && MathAbs(tp/ticksize-MathRound(tp/ticksize))>0.00001))
         return Reject("SL/TP must match the broker tick size");
      bool buy=(side==ORDER_TYPE_BUY);
      double reference=buy?tick.bid:tick.ask;
      double distance=SymbolInfoInteger(symbol,SYMBOL_TRADE_STOPS_LEVEL)*point;
      if((sl>0 && (buy?(sl>=reference || reference-sl<distance):(sl<=reference || sl-reference<distance))) ||
         (tp>0 && (buy?(tp<=reference || tp-reference<distance):(tp>=reference || reference-tp<distance))))
         return Reject("SL/TP direction or minimum distance invalid");
      if(!trade.SetTypeFillingBySymbol(symbol)) return Reject("unsupported filling mode");
      bool sent=buy?trade.Buy(volume,symbol,0,sl,tp,comment):trade.Sell(volume,symbol,0,sl,tp,comment);
      uint result=trade.ResultRetcode();
      PrintFormat("MT5 request | retcode=%u | %s | order=%I64u | deal=%I64u",
                  result,trade.ResultRetcodeDescription(),trade.ResultOrder(),trade.ResultDeal());
      return sent && (result==TRADE_RETCODE_DONE || result==TRADE_RETCODE_DONE_PARTIAL ||
                      result==TRADE_RETCODE_PLACED);
   }
};
#endif
