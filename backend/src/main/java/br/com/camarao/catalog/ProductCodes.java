package br.com.camarao.catalog;

import br.com.camarao.shared.*;
import java.text.Normalizer;
import java.util.*;
import java.util.regex.Pattern;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Mono;

@Component
class ProductCodes {
    private static final long MAX=99_999_999_999_999_999L;
    private static final Pattern NUMBERED=Pattern.compile("([A-Za-z]{1,3})-([0-9]{1,17})");
    private final Sql sql;
    ProductCodes(Sql sql){this.sql=sql;}
    static String prefix(String name){
        String letters=Normalizer.normalize(name,Normalizer.Form.NFD).replaceAll("\\p{M}+","").toUpperCase(Locale.ROOT).replaceAll("[^A-Z]","");
        return letters.isEmpty()?"PRO":letters.substring(0,Math.min(3,letters.length()));
    }
    // The catalog caller holds one transaction across this lock, allocation and product write.
    Mono<Void> lock(){return sql.one("SELECT id FROM product_code_guard WHERE id=1 FOR UPDATE",Map.of())
        .switchIfEmpty(Mono.error(new IllegalStateException("Controle de códigos não inicializado."))).then();}
    Mono<String> create(String requested,String name){
        if(requested!=null&&!requested.isBlank())return reserve(requested.trim());
        String prefix=prefix(name);
        return sql.one("SELECT COALESCE(MAX(CAST(SUBSTRING(code,LOCATE('-',code)+1) AS UNSIGNED)),0) AS last_number FROM products WHERE REGEXP_LIKE(code,:pattern,'i')",
                Map.of("pattern","^"+prefix+"-[0-9]{1,17}$"))
            .flatMap(row->store(prefix,Sql.id(row,"last_number"))).then(Mono.defer(()->next(prefix)));
    }
    Mono<String> edit(String requested,String existing){return reserve(requested==null||requested.isBlank()?existing:requested.trim());}
    private Mono<Long> store(String prefix,long value){
        return sql.update("INSERT INTO product_code_sequences(prefix,last_number) VALUES(:prefix,:value) ON DUPLICATE KEY UPDATE last_number=GREATEST(last_number,:value)",Map.of("prefix",prefix,"value",value));
    }
    private Mono<String> reserve(String code){
        var match=NUMBERED.matcher(code);
        if(!match.matches())return Mono.just(code);
        return store(match.group(1).toUpperCase(Locale.ROOT),Long.parseLong(match.group(2))).thenReturn(code);
    }
    private Mono<String> next(String prefix){
        return sql.one("SELECT last_number FROM product_code_sequences WHERE prefix=:prefix FOR UPDATE",Map.of("prefix",prefix)).flatMap(row->{
            long last=Sql.id(row,"last_number");Rules.require(last<MAX,"Limite de códigos automáticos atingido. Informe um código manual.");
            long number=last+1;String code=prefix+"-"+String.format(Locale.ROOT,"%03d",number);
            return sql.update("UPDATE product_code_sequences SET last_number=:number WHERE prefix=:prefix",Map.of("number",number,"prefix",prefix))
                .then(sql.one("SELECT id FROM products WHERE code=:code",Map.of("code",code)).hasElement())
                .flatMap(exists->exists?Mono.defer(()->next(prefix)):Mono.just(code));
        });
    }
}
