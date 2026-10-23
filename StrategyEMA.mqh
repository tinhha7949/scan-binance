#ifndef MT5_STRATEGY_EMA_MQH
#define MT5_STRATEGY_EMA_MQH

// Only closed candles: older candle first, latest closed candle second.
int EMACrossSignal(double fast_old,double fast_new,double slow_old,double slow_new)
{
   if(fast_old<=slow_old && fast_new>slow_new) return 1;
   if(fast_old>=slow_old && fast_new<slow_new) return -1;
   return 0;
}

class CEMAStrategy
{
private:
   int fast,slow,slow_period;
public:
   CEMAStrategy() { fast=INVALID_HANDLE; slow=INVALID_HANDLE; slow_period=0; }
   bool Init(string symbol,ENUM_TIMEFRAMES timeframe,int fast_period,int period)
   {
      slow_period=period;
      fast=iMA(symbol,timeframe,fast_period,0,MODE_EMA,PRICE_CLOSE);
      slow=iMA(symbol,timeframe,period,0,MODE_EMA,PRICE_CLOSE);
      return fast!=INVALID_HANDLE && slow!=INVALID_HANDLE;
   }
   void Release()
   {
      if(fast!=INVALID_HANDLE) IndicatorRelease(fast);
      if(slow!=INVALID_HANDLE) IndicatorRelease(slow);
      fast=INVALID_HANDLE;
      slow=INVALID_HANDLE;
   }
   bool Read(int &signal)
   {
      if(BarsCalculated(fast)<slow_period+3 || BarsCalculated(slow)<slow_period+3) return false;
      double f[2],s[2];
      // CopyBuffer writes the oldest requested value to physical index 0.
      if(CopyBuffer(fast,0,1,2,f)!=2 || CopyBuffer(slow,0,1,2,s)!=2) return false;
      signal=EMACrossSignal(f[0],f[1],s[0],s[1]);
      return true;
   }
};
#endif
