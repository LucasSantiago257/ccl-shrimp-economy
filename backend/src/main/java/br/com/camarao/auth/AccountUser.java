package br.com.camarao.auth;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.authority.AuthorityUtils;
public class AccountUser extends User {
    private final long version;
    public AccountUser(String username,String password,long version) {
        super(username,password,AuthorityUtils.createAuthorityList("ROLE_ADMIN"));
        this.version=version;
    }
    public long version() { return version; }
}

