#ifndef MT5_ORDER_EXECUTION_MQH
#define MT5_ORDER_EXECUTION_MQH
#include <Trade/Trade.mqh>

// All order checks, price/volume rules, broker requests and result handling live here.
class COrderExecution
{
private:
   CTrade trade;
public:
   bool Init(string symbol,ulong magic)
   {
      trade.SetExpertMagicNumber(magic);
      trade.SetDeviationInPoints(10);
      trade.SetAsyncMode(false);
      return trade.SetTypeFillingBySymbol(symbol);
   }
   void Execute(int signal,string symbol,bool enabled,double lots,
                int stop_points,int take_points,int max_spread)
   {
      // Check mode again at execution time, even after account changes.
      if(!enabled || (signal!=1 && signal!=-1) ||
         AccountInfoInteger(ACCOUNT_TRADE_MODE)!=ACCOUNT_TRADE_MODE_DEMO) return;
      if(lots<=0 || stop_points<=0 || take_points<=0 || max_spread<=0) return;
      double point=SymbolInfoDouble(symbol,SYMBOL_POINT);
      int digits=(int)SymbolInfoInteger(symbol,SYMBOL_DIGITS);
      if(point<=0) return;
      bool buy=(signal==1);
      if(!TerminalInfoInteger(TERMINAL_CONNECTED) ||
         !TerminalInfoInteger(TERMINAL_TRADE_ALLOWED) ||
         !MQLInfoInteger(MQL_TRADE_ALLOWED) ||
         !AccountInfoInteger(ACCOUNT_TRADE_ALLOWED) ||
         !AccountInfoInteger(ACCOUNT_TRADE_EXPERT)) return;
      // Any position/order on this symbol blocks entry, including manual trades.
      for(int i=PositionsTotal()-1;i>=0;i--)
         if(PositionGetTicket(i)>0 && PositionGetString(POSITION_SYMBOL)==symbol) return;
      for(int i=OrdersTotal()-1;i>=0;i--)
         if(OrderGetTicket(i)>0 && OrderGetString(ORDER_SYMBOL)==symbol) return;
      MqlTick tick;
      if(!SymbolInfoTick(symbol,tick) || tick.ask<=0 || tick.bid<=0 ||
         tick.time<TimeCurrent()-60) return;
      if((tick.ask-tick.bid)/point>max_spread) return;
      double step=SymbolInfoDouble(symbol,SYMBOL_VOLUME_STEP);
      double minlot=SymbolInfoDouble(symbol,SYMBOL_VOLUME_MIN);
      double maxlot=SymbolInfoDouble(symbol,SYMBOL_VOLUME_MAX);
      if(step<=0 || lots<minlot || lots>maxlot ||
         MathAbs(lots/step-MathRound(lots/step))>0.000001)
      { Print("lots incompatible with broker; entry skipped."); return; }
      double ticksz=SymbolInfoDouble(symbol,SYMBOL_TRADE_TICK_SIZE);
      if(ticksz<=0) return;
      double price=buy?tick.ask:tick.bid;
      double sl=buy?price-stop_points*point:price+stop_points*point;
      double tp=buy?price+take_points*point:price-take_points*point;
      sl=NormalizeDouble((buy?MathFloor(sl/ticksz):MathCeil(sl/ticksz))*ticksz,digits);
      tp=NormalizeDouble((buy?MathCeil(tp/ticksz):MathFloor(tp/ticksz))*ticksz,digits);
      double mindist=SymbolInfoInteger(symbol,SYMBOL_TRADE_STOPS_LEVEL)*point;
      if((buy && (tick.bid-sl<mindist || tp-tick.bid<mindist)) ||
         (!buy && (sl-tick.ask<mindist || tick.ask-tp<mindist)))
      { Print("SL/TP too close for broker; entry skipped."); return; }
      bool sent=buy?trade.Buy(lots,symbol,0,sl,tp,"Demo EMA"):
                    trade.Sell(lots,symbol,0,sl,tp,"Demo EMA");
      uint code=trade.ResultRetcode();
      if(!sent || (code!=TRADE_RETCODE_DONE && code!=TRADE_RETCODE_DONE_PARTIAL &&
                   code!=TRADE_RETCODE_PLACED))
         Print("Entry failed: ",code," ",trade.ResultRetcodeDescription());
      else Print("Entry accepted: ",code," deal=",trade.ResultDeal());
   }
};
#endif
