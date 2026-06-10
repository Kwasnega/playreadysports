const fs = require('fs');
const path = require('path');

function walk(dir, callback) {
    fs.readdirSync(dir).forEach(f => {
        let dirPath = path.join(dir, f);
        let isDirectory = fs.statSync(dirPath).isDirectory();
        isDirectory ? walk(dirPath, callback) : callback(path.join(dir, f));
    });
}

walk('c:/Users/hp/Desktop/playreadysports/src', (filePath) => {
    if (!filePath.endsWith('.tsx') && !filePath.endsWith('.ts')) return;
    let content = fs.readFileSync(filePath, 'utf8');
    let original = content;

    // 1. Time block digits text-foreground -> text-primary
    content = content.replace(/accent === "warn" \? "text-warn" : "text-foreground"/g, 'accent === "warn" ? "text-warn" : "text-primary"');
    content = content.replace(/tight \? "text-warn" : "text-foreground"/g, 'tight ? "text-warn" : "text-primary"');

    // 2. Wallet balance displays
    content = content.replace(/bg-secondary text-foreground(.*?)hover:bg-secondary\/80/g, 'bg-[hsl(var(--gold))] text-[hsl(var(--gold-foreground))]$1hover:opacity-90');

    // 3. Create Match buttons (Index.tsx, CreateMatch.tsx, etc.)
    content = content.replace(/bg-primary text-primary-foreground([^>]*>)[^<]*Create match/gi, 'bg-[hsl(var(--gold))] text-[hsl(var(--gold-foreground))]$1Create match');
    content = content.replace(/bg-primary text-primary-foreground(.*?)Create match<\/span>/gis, 'bg-[hsl(var(--gold))] text-[hsl(var(--gold-foreground))]$1Create match</span>');

    // 4. Have a code? secondary accent bars
    content = content.replace(/bg-primary\/10 hover:bg-primary\/15(.*?)Have a code/g, 'bg-[hsl(var(--gold))]/12 border border-[hsl(var(--gold))]/25 hover:bg-[hsl(var(--gold))]/20$1Have a code');
    content = content.replace(/bg-primary\/10 text-primary(.*?)Have a code\?/g, 'bg-[hsl(var(--gold))]/12 border border-[hsl(var(--gold))]/25 text-foreground$1Have a code?');
    // Inside that block:
    content = content.replace(/bg-primary text-primary-foreground( inline-flex items-center justify-center">\s*<KeyRound)/g, 'bg-[hsl(var(--gold))] text-[hsl(var(--gold-foreground))]$1');
    content = content.replace(/<span className="text-\[11px\] font-semibold text-primary">Enter →<\/span>/g, '<span className="text-[11px] font-semibold bg-[hsl(var(--gold))] text-[hsl(var(--gold-foreground))] rounded-full px-2 py-0.5">Enter →</span>');
    content = content.replace(/<span className="text-sm font-semibold text-primary">Have a code\?<\/span>/g, '<span className="text-sm font-semibold text-foreground">Have a code?</span>');

    // 5. Stats bars / live indicator chips
    content = content.replace(/bg-primary\/10 text-primary/g, 'bg-primary/8 border border-primary/15 text-primary');
    content = content.replace(/bg-primary\/10 px-3.5/g, 'bg-primary/8 border border-primary/15 px-3.5');

    // 6. Fix for "Have a code" where KeyRound icon was primary but not covered
    content = content.replace(/<KeyRound className="w-3\.5 h-3\.5"\s*\/>/g, '<KeyRound className="w-3.5 h-3.5 text-[hsl(var(--gold))]" />');

    if (content !== original) {
        fs.writeFileSync(filePath, content);
        console.log('Updated: ' + filePath);
    }
});
