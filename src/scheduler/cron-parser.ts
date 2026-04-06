function parseField(field: string, min:number, max: number): Set<number>{
    let resultat: Set<number> = new Set<number>();

    if(field === '*'){
        for(let i = min;i <= max;i++){
            resultat.add(i);
        }
        return resultat;
    }

    const every_Kth = /^\*\/([1-9]\d*)$/;
    const range = /^(\d+)-(\d+)$/;
    const list = /^\d+(?:,\d+)+$/;
    const singleValue = /^\d+$/;

    if(every_Kth.test(field)){
        const match: RegExpMatchArray | null = field.match(every_Kth);
        const num: number = Number(match![1]);

        if(Number.isNaN(num) || num < min || num > max || num === 0) return resultat;

        for(let i = min;i <= max;i = i + num){
            resultat.add(i);
        }
    } else if(range.test(field)){
        const match: RegExpMatchArray | null = field.match(range);
        const num1: number = Number(match![1]);
        const num2: number = Number(match![2]);

        if(Number.isNaN(num1) || Number.isNaN(num2) || num1 < min || num1 > max || num2 < min || num2 > max || num2 < num1) return resultat;

        for(let i = num1;i <= num2;i++){
            resultat.add(i);
        }
    } else if(list.test(field)){
        const match: RegExpMatchArray | null = field.match(list);
        let verified: number = 1;

        match![0].split(',').map(Number).forEach(num => {
            if(num < min || num > max) verified = 0;
        });

        if(!verified) return resultat;

        resultat = new Set(match![0].split(',').map(Number).filter(num => num >= min && num <= max));
    } else if(singleValue.test(field)){
        const value: number = Number(field);

        if(Number.isNaN(value) || value < min || value > max){
            return resultat;
        }
        resultat.add(value);
    }

    return resultat;
}

export function nextRun(expression: string, from: Date = new Date()): Date | null {
    const fields = expression.trim().split(/\s+/);
    if (fields.length !== 5) {
        return null;
    }

    const isDayOfMonthRestricted = fields[2] !== "*";
    const isDayOfWeekRestricted = fields[4] !== "*";

    const minutes = parseField(fields[0], 0, 59);
    const hours = parseField(fields[1], 0, 23);
    const dayOfMonth = parseField(fields[2], 1, 31);
    const months = parseField(fields[3], 1, 12);
    const dayOfWeek = parseField(fields[4], 0, 6);

    if (
        minutes.size === 0 ||
        hours.size === 0 ||
        dayOfMonth.size === 0 ||
        months.size === 0 ||
        dayOfWeek.size === 0
    ) {
        return null;
    }

    const candidate = new Date(from);
    candidate.setSeconds(0, 0);
    candidate.setMinutes(candidate.getMinutes() + 1);

    const searchLimitInMinutes = 60 * 24 * 366 * 5;

    for (let i = 0; i < searchLimitInMinutes; i++) {
        const minuteMatches = minutes.has(candidate.getMinutes());
        const hourMatches = hours.has(candidate.getHours());
        const monthMatches = months.has(candidate.getMonth() + 1);
        const dayOfMonthMatches = dayOfMonth.has(candidate.getDate());
        const dayOfWeekMatches = dayOfWeek.has(candidate.getDay());

        const dayMatches =
            isDayOfMonthRestricted && isDayOfWeekRestricted
                ? (dayOfMonthMatches || dayOfWeekMatches)
                : (dayOfMonthMatches && dayOfWeekMatches);

        const matches = minuteMatches && hourMatches && monthMatches && dayMatches;

        if (matches) {
            return candidate;
        }

        candidate.setMinutes(candidate.getMinutes() + 1);
    }

    return null;
}

console.log(nextRun('0 0 29 2 *',new Date()));