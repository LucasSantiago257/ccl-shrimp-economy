package br.com.camarao.auth;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSenderImpl;
import org.springframework.stereotype.Component;
import java.net.URI;
@Component
public class ResetMailer {
    private final JavaMailSenderImpl sender=new JavaMailSenderImpl();
    private final String from;
    private final String url;
    public ResetMailer(@Value("${app.mail.host:}") String host,@Value("${app.mail.port:465}") int port,
        @Value("${app.mail.username:}") String username,@Value("${app.mail.password:}") String password,
        @Value("${app.mail.from:}") String from,@Value("${app.public-url:http://localhost:5173}") String url,
        @Value("${app.mail.ssl:true}") boolean ssl,@Value("${app.mail.starttls:false}") boolean tls) {
        this.from=from;this.url=url.replaceAll("/+$","");
        sender.setDefaultEncoding("UTF-8");
        sender.setHost(host);sender.setPort(port);
        if(!username.isBlank()) { sender.setUsername(username);sender.setPassword(password); }
        var properties=sender.getJavaMailProperties();
        properties.setProperty("mail.smtp.auth",String.valueOf(!username.isBlank()));
        properties.setProperty("mail.smtp.ssl.enable",String.valueOf(ssl));
        properties.setProperty("mail.smtp.ssl.checkserveridentity","true");
        properties.setProperty("mail.smtp.starttls.enable",String.valueOf(tls));
        properties.setProperty("mail.smtp.starttls.required",String.valueOf(tls));
        properties.setProperty("mail.smtp.connectiontimeout","8000");
        properties.setProperty("mail.smtp.timeout","8000");
        properties.setProperty("mail.smtp.writetimeout","8000");
    }
    public boolean configured() {
        try {
            var uri=URI.create(url);
            boolean secure="https".equals(uri.getScheme()) || ("http".equals(uri.getScheme()) && ("localhost".equals(uri.getHost()) || "127.0.0.1".equals(uri.getHost())));
            return sender.getHost()!=null && !sender.getHost().isBlank() && !from.isBlank() && secure && uri.getHost()!=null && uri.getUserInfo()==null && uri.getQuery()==null && uri.getFragment()==null;
        } catch(Exception e) { return false; }
    }
    public void send(String recipient,String token) {
        var message=new SimpleMailMessage();
        message.setTo(recipient);message.setFrom(from);
        message.setSubject("Maré — redefinição de senha");
        message.setText("Use o link abaixo para definir sua nova senha. Ele expira em 30 minutos e pode ser usado uma única vez.\n\n"+url+"/#reset-password="+token+"\n\nSe você não solicitou a alteração, ignore este e-mail.");
        sender.send(message);
    }
}

