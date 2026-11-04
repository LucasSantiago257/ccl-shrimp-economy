package br.com.camarao.auth;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import org.springframework.stereotype.Component;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
@Component
public class AuthThrottle {
    private record Window(long minute,int count) {}
    private final Map<String,Window> windows=new HashMap<>();
    public synchronized void check(String action,int limit) {
        long minute=Instant.now().getEpochSecond()/60;
        var current=windows.get(action);
        int count=current!=null && current.minute()==minute ? current.count()+1 : 1;
        windows.put(action,new Window(minute,count));
        if(count>limit) throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,"Muitas tentativas. Aguarde um minuto.");
    }
}

