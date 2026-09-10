"""Family hypothesis figures from the tagged CSVs; no new classification logic."""
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

ROOT=Path(__file__).resolve().parent
read=lambda name:list(csv.DictReader((ROOT/'data'/f'{name}.csv').open()))
dt=lambda s:datetime.fromisoformat(s.replace('Z','+00:00'))
now=dt(json.loads((ROOT/'family_summary.json').read_text())['clock'])
plt.rcParams.update({'font.size':11,'axes.spines.top':False,'axes.spines.right':False,'axes.titleweight':'bold','figure.facecolor':'white','savefig.facecolor':'white'})
rows={r['group']:r for r in read('cohort_activity')}
order=['major_labs','other_hosted_candidates','deepseek_glm_kimi_qwen','meta_mistral','open_weight_families','misc']
labels=['Claude / proprietary OpenAI / Gemini','Other hosted candidates','DeepSeek / GLM / Kimi / Qwen','Meta / Mistral','Open-weight-associated families','Miscellaneous']
fig,axes=plt.subplots(2,1,figsize=(15,11),layout='constrained')
ax=axes[0]
for offset,key,label,color in [(-.25,'model_percent','Current model IDs','#356aa0'),(0,'endpoint_percent','Current endpoint records','#39806b'),(.25,'change_share_30d','Counted changes · last 30d','#b66735')]:
    values=[float(rows[k][key]) for k in order]
    bars=ax.barh([i+offset for i in range(len(order))],values,height=.23,label=label,color=color)
    ax.bar_label(bars,labels=[f'{v:.2f}%' if 0<v<.1 else f'{v:.1f}%' for v in values],padding=3,fontsize=9)
ax.set_yticks(range(len(order)),labels);ax.invert_yaxis();ax.set_xlim(0,106)
ax.xaxis.set_major_formatter(PercentFormatter(100));ax.set_title('A large catalog share can contribute almost no pricing activity')
ax.legend(loc='lower right');ax.grid(axis='x',alpha=.15)
ax=axes[1]
for offset,days,label,color in [(-.16,30,'Full 30-day coverage','#356aa0'),(.16,90,'Full 90-day coverage','#94acbf')]:
    nums=[int(rows[k][f'full_window_zero_all_meter_models_{days}d']) for k in order]
    denoms=[int(rows[k][f'full_window_models_{days}d']) for k in order]
    values=[100*a/b for a,b in zip(nums,denoms)]
    bars=ax.barh([i+offset for i in range(len(order))],values,height=.3,label=label,color=color)
    ax.bar_label(bars,labels=[f'{a}/{b} · {v:.1f}%' for a,b,v in zip(nums,denoms,values)],padding=3,fontsize=9)
ax.set_yticks(range(len(order)),labels);ax.invert_yaxis();ax.set_xlim(0,122)
ax.set_xticks(range(0,101,20))
ax.xaxis.set_major_formatter(PercentFormatter(100));ax.set_title('Quiet models are common even in the busiest families')
ax.legend(loc='lower right');ax.grid(axis='x',alpha=.15)
fig.suptitle('Testing model-family priors against observed pricing behavior',fontsize=18)
fig.supxlabel('Current catalog: 410 model IDs / 1,267 endpoints; all variants included; Lyria excluded.\nActivity includes departed endpoints of current models; schedule and representation exclusions still apply.\nLower panel: share with no counted meter change, among models listed throughout each full window.',fontsize=10)
fig.savefig(ROOT/'figures/07-family-comparison.png',dpi=160);plt.close(fig)

models={r['model_id']:r for r in read('model_family_activity')}
segments=read('segments');start=now-timedelta(days=90)
selected=['anthropic/claude-opus-4.8','deepseek/deepseek-v4-flash','openai/gpt-5.6-sol','z-ai/glm-5.3','google/gemini-3.7-flash','moonshotai/kimi-k3']
fig,axes=plt.subplots(3,2,figsize=(16,12),layout='constrained')
for ax,mid in zip(axes.flat,selected):
    m=models[mid];last={}
    for r in segments:
        if r['model_id']!=mid or dt(r['end'])<=start:
            continue
        eid=r['endpoint_id']
        if not r['prompt']:
            last.pop(eid,None);continue
        a,b=max(start,dt(r['start'])),dt(r['end']);value=float(r['prompt'])*1e6
        color=colorsys.hls_to_rgb(int(hashlib.sha256(r['provider_tag'].encode()).hexdigest()[:8],16)/0xffffffff,.4,.55)
        ax.plot([a,b],[value,value],color=color,lw=1,alpha=.8,ls='--' if r['scheduled']=='True' else '-')
        if eid in last and last[eid][0]==a:
            ax.plot([a,a],[last[eid][1],value],color=color,lw=.7,alpha=.7)
        last[eid]=(b,value)
    ax.set(title=f"{m['name']}\n{m['all_meter_changes_7d']} changes / 7d · {m['all_meter_changes_30d']} / 30d · {m['current_tags']} current tags",xlim=(start,now),ylim=(0,None),ylabel='Input $ / million tokens')
    locator=mdates.AutoDateLocator(minticks=4,maxticks=6);ax.xaxis.set_major_locator(locator);ax.xaxis.set_major_formatter(mdates.ConciseDateFormatter(locator));ax.grid(alpha=.15)
fig.suptitle('Family predicts the broad pattern; individual model history still matters',fontsize=18)
fig.supxlabel('Every observed endpoint history in the same 90-day window; separate price scales. Blank pre-listing periods remain blank.\nCounts cover all effective meters after exclusions; plotted values are input quotes, including scheduled spans (dashed).',fontsize=10)
fig.savefig(ROOT/'figures/08-family-histories.png',dpi=160);plt.close(fig)
print('Wrote family-comparison and family-histories figures')
