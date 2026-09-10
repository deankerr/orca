"""Second-pass figures, drawn only from regenerated CSVs. Requires Matplotlib."""
import colorsys
import csv
from datetime import datetime, timedelta
import hashlib
import json
from pathlib import Path

import matplotlib
matplotlib.use('Agg')
import matplotlib.dates as mdates
import matplotlib.pyplot as plt
from matplotlib.ticker import PercentFormatter

ROOT = Path(__file__).resolve().parent
FIG = ROOT / 'figures'
BLUE, GREEN, ORANGE, GRAY = '#356aa0', '#39806b', '#b66735', '#acb6c0'
plt.rcParams.update({'font.size': 11, 'axes.spines.top': False, 'axes.spines.right': False,
                     'axes.titleweight': 'bold', 'figure.facecolor': 'white', 'savefig.facecolor': 'white'})


def read(name):
    return list(csv.DictReader((ROOT / 'data' / f'{name}.csv').open()))


def dt(x):
    return datetime.fromisoformat(x.replace('Z', '+00:00'))


def date_axis(ax):
    ax.xaxis.set_major_locator(mdates.AutoDateLocator(minticks=4, maxticks=7))
    ax.xaxis.set_major_formatter(mdates.ConciseDateFormatter(ax.xaxis.get_major_locator()))
    ax.grid(axis='y', alpha=.18)


def save(fig, name):
    fig.savefig(FIG / f'{name}.png', dpi=160)
    plt.close(fig)


summary = json.loads((ROOT / 'summary.json').read_text())
now = dt(summary['clock'])
daily, models, monthly = read('meter_history_daily'), read('models'), read('monthly')
segments = read('segments')
dates = [dt(r['at']) for r in daily]
fig = plt.figure(figsize=(15, 10), layout='constrained')
gs = fig.add_gridspec(2, 2, height_ratios=[1.35, 1])
ax = fig.add_subplot(gs[0, :])
ax.plot(dates, [float(r['input_cache_read_percent']) for r in daily], color=BLUE, lw=2.5, label='All endpoints listed at each date')
ax.plot(dates, [float(r['survivor_cache_percent']) for r in daily], color=GREEN, lw=1.7, label='Fixed cohort: 148 continuously listed endpoints')
ax.scatter([dates[0], dates[-1]], [float(daily[0]['input_cache_read_percent']), float(daily[-1]['input_cache_read_percent'])], color=BLUE)
for i, label, offset in [(0, '12.9% · 95 / 734', (8, 12)), (-1, '73.4% · 930 / 1,267', (-150, 12))]:
    ax.annotate(label, (dates[i], float(daily[i]['input_cache_read_percent'])), xytext=offset, textcoords='offset points', color=BLUE, weight='bold')
ax.set(title='A nonzero cache-read rate became common in the listed catalog', ylabel='Endpoints with metered input_cache_read', ylim=(0,100))
ax.yaxis.set_major_formatter(PercentFormatter(100))
ax.legend(loc='upper left')
date_axis(ax)
ax = fig.add_subplot(gs[1,0])
cohorts = read('cache_first_observed_cohorts')
ax.bar(range(len(cohorts)), [float(r['initial_cache_percent']) for r in cohorts], color=BLUE)
ax.set_xticks(range(len(cohorts)), [r['first_observed_month'][2:] for r in cohorts], rotation=60)
ax.set(title='Newly observed endpoints increasingly arrive metered', ylabel='Cache-read metered at first observation', ylim=(0,100))
ax.yaxis.set_major_formatter(PercentFormatter(100))
ax.text(.02,.97,'First bar includes the initial inventory; final month is partial.',transform=ax.transAxes,va='top',fontsize=9)
ax = fig.add_subplot(gs[1,1])
bridge = read('cache_population_bridge_daily')
values = [sum(int(r['entering_cache_metered'])-int(r['exiting_cache_metered']) for r in bridge), sum(int(r['continuing_added_cache_meter'])-int(r['continuing_removed_cache_meter']) for r in bridge)]
bars = ax.bar(['Entry / exit\nnet contribution', 'Meter changes on\ncontinuing endpoints'], values, color=[BLUE,GREEN])
ax.bar_label(bars, padding=4, fmt='+%g')
ax.set(title='The metered endpoint count grew by 835', ylabel='Net change in daily-sampled metered endpoints', ylim=(0,max(values)*1.25))
fig.suptitle('Cache-read metering over time · second research pass', fontsize=19)
fig.supxlabel('Zero and absent both mean unmetered. This is pricing-meter prevalence, not feature support or usage.\nDaily UTC snapshots; Lyria excluded. The fixed cohort illustrates survivor bias, not a causal decomposition.', fontsize=10)
save(fig,'01-cache-history')

fig, axes = plt.subplots(2,2,figsize=(15,10),layout='constrained')
active = [r for r in models if r['current']=='True']
bins = [(1,1,'1'),(2,3,'2–3'),(4,7,'4–7'),(8,15,'8–15'),(16,100,'16+')]
ax=axes[0,0]
counts=[sum(a<=int(r['current_tags'])<=b for r in active) for a,b,_ in bins]
bars=ax.bar([s for _,_,s in bins],counts,color=BLUE)
ax.bar_label(bars,padding=3)
ax.set(title='Most listed models still offer few choices',xlabel='Current provider tags per model',ylabel='Models',ylim=(0,max(counts)*1.15))
ax=axes[0,1]
top=models[:7]
values=[int(r['changes_30d']) for r in top]+[summary['changes_30d']-sum(int(r['changes_30d']) for r in top)]
labels=[r['model_name'] for r in top]+['All other models']
bars=ax.barh(labels[::-1],values[::-1],color=[GRAY]+[BLUE]*len(top))
ax.bar_label(bars,padding=3)
ax.set(title='Counted activity remains concentrated',xlabel='Unscheduled normalized changes / last 30 days',xlim=(0,max(values)*1.16))
md=[datetime.strptime(r['month'],'%Y-%m') for r in monthly]
ax=axes[1,0]
ax.plot(md,[float(r['average_listed_endpoints']) for r in monthly],color=BLUE,marker='o')
ax.set(title='The catalog expanded fastest recently',ylabel='Average listed endpoints')
date_axis(ax)
ax=axes[1,1]
ax.plot(md,[float(r['counted_per_100_endpoint_days']) for r in monthly],color=ORANGE,marker='o')
ax.set(title='August → September: little change per endpoint',ylabel='Counted changes per 100 listed endpoint-days',ylim=(0,None))
date_axis(ax)
fig.suptitle('Catalog breadth and unscheduled pricing activity',fontsize=19)
fig.supxlabel('Zero ↔ absent, scheduled transitions and reviewed reporting episodes excluded from change counts.\nCounts are observations, not proof of billing changes. First and last months are partial.',fontsize=10)
save(fig,'02-landscape')

fig,axes=plt.subplots(3,2,figsize=(16,12),layout='constrained')
selected=['z-ai/glm-5.2','deepseek/deepseek-v4-flash','minimax/minimax-m3','anthropic/claude-opus-4.8','z-ai/glm-5.3','deepseek/deepseek-v4-flash-0731']
for ax,mid in zip(axes.flat,selected):
    model=next(r for r in models if r['model_id']==mid)
    rows=[r for r in segments if r['model_id']==mid and dt(r['end'])>now-timedelta(days=90)]
    start=max(now-timedelta(days=90),min(dt(r['start']) for r in rows))
    last={}
    for r in rows:
        eid=r['endpoint_id']
        if not r['prompt']:
            last.pop(eid,None)
            continue
        a,b=max(start,dt(r['start'])),dt(r['end'])
        v=float(r['prompt'])*1e6
        color=colorsys.hls_to_rgb(int(hashlib.sha256(r['provider_tag'].encode()).hexdigest()[:8],16)/0xffffffff,.4,.55)
        ax.plot([a,b],[v,v],color=color,lw=.8,alpha=.8,linestyle='--' if r['scheduled']=='True' else '-')
        if eid in last and last[eid][0]==a:
            ax.plot([a,a],[last[eid][1],v],color=color,lw=.65,alpha=.7)
        last[eid]=(b,v)
    ax.set(title=f"{model['model_name']} · {model['historical_tags']} historical tags\n{model['changes_30d']} counted changes / 30d",ylabel='Input $ / million tokens',xlim=(start,now),ylim=(0,None))
    date_axis(ax)
fig.suptitle('All observed histories remain available after change-count exclusions',fontsize=18)
fig.supxlabel('Exact observed steps, separate scales; no provider selection. Dashed spans indicate scheduled pricing.\nUnmetered states are not drawn as zero-priced offers. Unlisted intervals remain gaps.',fontsize=10)
save(fig,'03-exact-histories')

fig,axes=plt.subplots(1,3,figsize=(17,5.5),layout='constrained')
ratios=read('current_ratios')
for ax,meter,label in zip(axes[:2],['completion','input_cache_read'],['Output','Cache read']):
    seen=set()
    for r in ratios:
        if r['model_id']!='z-ai/glm-5.2' or r['meter']!=meter or r['provider_tag'] in seen:
            continue
        seen.add(r['provider_tag'])
        ax.scatter(float(r['prompt'])*1e6,float(r['value'])*1e6,color=BLUE,s=25,alpha=.7)
    ax.set(title=f'GLM 5.2 · {label.lower()}',xlabel='Input $ / million tokens',ylabel=f'{label} $ / million tokens',xlim=(0,None),ylim=(0,None))
    ax.grid(alpha=.2)
ax=axes[2]
values=[summary['ratio_preserved_exact_30d'],summary['ratio_preserved_1bp_30d']-summary['ratio_preserved_exact_30d'],summary['ratio_eligible_30d']-summary['ratio_preserved_1bp_30d']]
bars=ax.bar(['Exact','Drift ≤ 1bp','Drift > 1bp'],values,color=[BLUE,GREEN,ORANGE])
ax.bar_label(bars,padding=4)
ax.set(title='Recent core-meter ratio comparisons',ylabel='Counted eligible transitions',ylim=(0,max(values)*1.15))
fig.suptitle('Shared movement does not imply shared provider rankings',fontsize=18)
fig.supxlabel('Positive comparable meters only. Stable membership required for ratio comparisons. Scheduled transitions excluded.\nEach scatter point is one current provider tag; identical duplicate UUIDs are collapsed.',fontsize=10)
save(fig,'04-ratios')

fig,axes=plt.subplots(2,1,figsize=(15,8),layout='constrained')
end=now.replace(hour=0,minute=0,second=0,microsecond=0)
start=end-timedelta(days=7)
for ax,tag in zip(axes,['baidu/fp8','novita/fp8']):
    rs=[r for r in segments if r['model_id']=='z-ai/glm-5.2' and r['provider_tag']==tag and dt(r['end'])>start and dt(r['start'])<end and r['prompt']]
    spans=sorted((max(start,dt(r['start'])),min(end,dt(r['end'])),float(r['prompt'])*1e6) for r in rs)
    for i,(a,b,v) in enumerate(spans):
        ax.plot([a,b],[v,v],color=BLUE,lw=1.2,label='Exact steps' if i==0 else None)
        if i and spans[i-1][1]==a:
            ax.plot([a,a],[spans[i-1][2],v],color=BLUE,lw=1.2)
    edges=[start+timedelta(days=i) for i in range(8)]
    closes,means,lows,highs=[],[],[],[]
    for a,b in zip(edges,edges[1:]):
        ss=[(max(a,x),min(b,y),v) for x,y,v in spans if x<b and y>a]
        assert abs(sum((y-x).total_seconds() for x,y,_ in ss)-86400)<.01
        closes.append(ss[-1][2]); lows.append(min(v for _,_,v in ss)); highs.append(max(v for _,_,v in ss))
        means.append(sum((y-x).total_seconds()*v for x,y,v in ss)/86400)
    ax.stairs(closes,edges,baseline=None,color=ORANGE,lw=2,label='Daily close')
    ax.stairs(means,edges,baseline=None,color=GREEN,lw=1.5,linestyle='--',label='Daily mean')
    ax.fill_between(edges,lows+[lows[-1]],highs+[highs[-1]],step='post',color=BLUE,alpha=.08,label='Daily min–max')
    ax.set(title=f'GLM 5.2 · {tag}',ylabel='Input $ / million tokens',xlim=(start,end))
    date_axis(ax)
    ax.legend(loc='upper left',bbox_to_anchor=(1.01,1),frameon=False)
fig.suptitle('Older detail: different reductions discard different information',fontsize=18)
fig.supxlabel('These two histories are unscheduled. A daily close loses excursions; a mean can be a price never quoted.\nA min–max range preserves extremes but loses duration and ordering. No aggregation is chosen as the product default.',fontsize=10)
save(fig,'05-resolution')

fig,axes=plt.subplots(2,1,figsize=(15,9),layout='constrained')
ax=axes[0]
for meter,label,color in [('input_cache_read','Cache read',BLUE),('input_cache_write','Cache write',GREEN),('web_search','Web search',ORANGE),('input_cache_write_1h','Cache write · 1h','#8b659c')]:
    ax.plot(dates,[float(r[meter+'_percent']) for r in daily],label=label,color=color,lw=2)
ax.set(title='Metered pricing became more varied',ylabel='Listed endpoints with nonzero meter',ylim=(0,100))
ax.yaxis.set_major_formatter(PercentFormatter(100)); ax.legend(loc='upper left'); date_axis(ax)
ax=axes[1]
bottom=[0]*len(monthly)
for key,label,color in [('counted','Counted',BLUE),('unmetered_equivalent','Zero / absent equivalence',GRAY),('reporting_excluded','Reviewed reporting episode',ORANGE),('scheduled_excluded','Scheduled',GREEN)]:
    vals=[int(r[key]) for r in monthly]
    ax.bar(md,vals,bottom=bottom,width=22,label=label,color=color)
    bottom=[a+b for a,b in zip(bottom,vals)]
ax.set(title='Raw observation volume is not pricing-change volume',ylabel='Continuous observations / month')
ax.legend(loc='upper left'); date_axis(ax)
fig.suptitle('An evolving pricing schema needs an explicit interpretation',fontsize=18)
fig.supxlabel('Meter prevalence does not measure feature support. Initial listings, relistings and metadata-only records omitted from lower panel.\nPartial first/last months; raw observations remain in source JSONL and the audit CSVs.',fontsize=10)
save(fig,'06-meter-evolution')
print('Wrote six second-pass figures')
