package br.com.camarao.shared;

import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

public record PageQuery(int page,int size,String q) {
    public PageQuery {
        if(page<1 || size<1 || size>100) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Página deve ser maior que zero; tamanho deve estar entre 1 e 100.");
        q=q==null ? "" : q.trim();
        if(q.length()>200) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"A busca deve ter até 200 caracteres.");
    }
    public long offset() { return (long)(page-1)*size; }
    public String like() { return "%"+q.replace("!","!!").replace("%","!%").replace("_","!_")+"%"; }
}
