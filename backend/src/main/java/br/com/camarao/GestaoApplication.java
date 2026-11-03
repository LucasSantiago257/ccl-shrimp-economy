package br.com.camarao;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.Bean;
import org.springframework.scheduling.annotation.EnableScheduling;
import java.time.Clock;

@SpringBootApplication
@EnableScheduling
public class GestaoApplication {
    @Bean Clock businessClock() { return Clock.systemUTC(); }
    public static void main(String[] args) { SpringApplication.run(GestaoApplication.class, args); }
}
