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

        if(!num || num < min || num > max || num == 0) return resultat;

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

        const nums: void = match![0].split(',').map(Number).forEach(num => {
            if(num < min || num > max) verified = 0;
        })

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

const resultat:Set<number> = parseField('20',0,59);
console.log(resultat);