package br.com.camarao.shared;

import java.util.Map;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.TransientDataAccessException;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.bind.support.WebExchangeBindException;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.server.ServerWebInputException;

@RestControllerAdvice
public class ApiErrors {
    @ExceptionHandler(ResponseStatusException.class)
    ResponseEntity<?> business(ResponseStatusException e) {
        return ResponseEntity.status(e.getStatusCode()).body(Map.of("message",e.getReason() == null ? "Requisição inválida." : e.getReason()));
    }
    @ExceptionHandler(WebExchangeBindException.class)
    ResponseEntity<?> validation(WebExchangeBindException e) {
        var errors = e.getFieldErrors().stream().map(f -> f.getField()+": "+f.getDefaultMessage()).toList();
        return ResponseEntity.badRequest().body(Map.of("message","Confira os campos informados.","errors",errors));
    }
    @ExceptionHandler(ServerWebInputException.class)
    ResponseEntity<?> input(ServerWebInputException e) {
        return ResponseEntity.badRequest().body(Map.of("message","Formato inválido. Confira os valores e campos da requisição."));
    }
    @ExceptionHandler({DataIntegrityViolationException.class,TransientDataAccessException.class})
    ResponseEntity<?> constraint(Exception e) {
        return ResponseEntity.status(409).body(Map.of("message","Conflito no cadastro ou operação concorrente. Atualize os dados e tente novamente."));
    }
}
