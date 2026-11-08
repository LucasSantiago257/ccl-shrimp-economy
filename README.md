# Maré — Gestão do camarão

Aplicação para uma empresa e um estoque: compras com fornecedor opcional, vendas por quilo, fiado, recebimentos parciais, despesas, perdas, pendências no painel e fechamento com snapshot imutável. Interface em português, adaptada a computador e celular.

## Executar com Docker Desktop

Pré-requisitos: Docker Desktop com motor Linux e Docker Compose 2.24.4 ou superior. Não é necessário instalar Java, Maven, Node ou MySQL no Windows para esta opção.

Na pasta do projeto, execute no PowerShell:

```powershell
./scripts/Initialize-Local.ps1
./scripts/Start-Local.ps1
```

Ou, depois de inicializar `.env`:

```powershell
docker compose up -d --build
```

Acesse **http://localhost:5173**. Consulte `APP_ADMIN_USERNAME` e `APP_ADMIN_PASSWORD` no arquivo `.env` para entrar. As credenciais são geradas aleatoriamente e não devem ser versionadas. Não existe senha padrão embutida no código.

Após o primeiro início, a senha passa a ser mantida no banco. Em **Perfil**, no rodapé da barra lateral, use a senha atual para definir uma nova. A alteração permanece após reiniciar o servidor e encerra os acessos anteriores. `APP_ADMIN_PASSWORD` serve para inicializar a conta; alterações posteriores devem ser feitas pelo Perfil ou pela recuperação. Alterar `APP_ADMIN_USERNAME` e reiniciar atualiza o nome do único usuário, preservando a senha do banco.

Para recuperar o acesso, configure `FALLBACK_MAIL`, `APP_PUBLIC_URL`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD` e `MAIL_FROM`. O link enviado pelo botão **Esqueci minha senha** vale por 30 minutos e só pode ser usado uma vez. O envio real aguarda credenciais SMTP e remetente válidos. Para Resend, use `smtp.resend.com`, porta `465`, usuário `resend`, a chave API como senha e um remetente do domínio verificado, com `SMTP_SSL=true`. [Configuração oficial](https://resend.com/changelog/smtp-service).

O MySQL fica em um volume próprio, sem porta pública na configuração padrão. Front-end e API são publicados apenas em `127.0.0.1`. A primeira construção baixa as imagens e dependências e pode levar alguns minutos. Para verificar:

```powershell
docker compose ps
docker compose logs --tail 100 backend
```

Para parar sem apagar o banco:

```powershell
./scripts/Stop-Local.ps1
```

**Não use `docker compose down -v` no ambiente com dados reais:** essa opção apaga os volumes. O volume persistente não substitui backup; antes de uso real, configurar backup e testar restauração.

## Primeiro uso

1. Cadastre um cliente. O fornecedor é opcional nas compras.
2. Em Produtos, ajuste o preço sugerido do Camarão ou cadastre outro produto.
3. Registre uma compra em Compras. Confirmar significa que os quilos foram recebidos.
4. Registre uma venda e, se necessário, informe **Desconto (R$)**. A tela mostra subtotal e total após o desconto. Confirmar significa que houve entrega e baixa do estoque.
5. Escolha receber tudo, uma parte ou vender fiado.
6. Em Financeiro → A receber, registre os pagamentos posteriores; também é possível pelo extrato do cliente.
7. Registre despesas operacionais e perdas de produto.
8. Consulte Fechamento por período e exporte CSV ou imprima.
9. O dia fecha automaticamente às **23h59, no horário da Bahia**. Para encerrar antes, use **Fechar dia de hoje**. Para outras datas, escolha o intervalo e use **Fechar intervalo selecionado**. No fechamento manual, confira os dados e confirme o bloqueio definitivo.

O painel apresenta os totais de **Vendas a receber** e **Compras a pagar**, além de até cinco pendências por categoria. Compras a pagar não incluem despesas operacionais. Compras sem fornecedor são identificadas pelo número da compra, inclusive no financeiro.

## Dashboards

Em **Resultados → Dashboards**, escolha um período para consultar vendas, resultado, caixa e volume em kg. A pizza mostra quanto dos documentos emitidos no período já estava pago na data final. Os saldos a receber e a pagar incluem também documentos anteriores. Cada gráfico oferece **Ver tabela** com os valores exatos.

## Desconto na venda

O desconto é um valor em reais por documento, de zero até o subtotal dos itens. O total líquido determina a receita, a cobrança e o valor recebido; o custo dos quilos vendidos permanece preservado. Exemplo: subtotal de R$ 500, desconto de R$ 50 e entrada de R$ 200 geram uma venda líquida de R$ 450 e dívida de R$ 250.

Desconto de 100% confirma a saída e registra seu custo sem criar cobrança ou recebimento de valor zero. Desconto acima do subtotal, negativo ou com frações de centavo é rejeitado. Compras não recebem desconto por documento nesta versão.

Os relatórios e novos snapshots mostram subtotal das vendas, descontos e receita líquida. Vendas antigas mantêm seus totais com desconto zero; snapshots já fechados preservam seus bytes e hash originais.

## Paginação e busca

Clientes, fornecedores, produtos, compras, vendas, despesas, movimentos, contas, pagamentos e fechamentos possuem busca no servidor e controles de primeira/anterior/próxima/última página. É possível escolher 10, 20, 50 ou 100 registros por página. A busca ou mudança de tamanho retorna à primeira página. Não há corte no total de registros acessíveis.

Os seletores de cliente, fornecedor e produto dos formulários também permitem pesquisar e navegar por páginas. Os saldos do extrato e os indicadores consideram todos os registros correspondentes, independentemente da página visível. O painel mantém suas prévias de cinco pendências e produtos, com acesso às listas completas.

A tela dos snapshots pagina os registros preservados para leitura; o download CSV continua completo. O estoque do relatório é paginado na tela e integral na impressão.

## Fechamento e snapshots

- Todos os dias, às **23h59 (America/Bahia)**, o servidor bloqueia novos lançamentos e preserva um snapshot identificado por **Sistema (automático)**, sem depender de navegador aberto ou comando do usuário. À meia-noite, o novo dia fica disponível.
- O serviço precisa estar em execução para fechar no horário. Se estiver desligado, os dias pendentes desde a ativação da automação são recuperados ao reiniciar, inclusive dias sem movimento. A captura registra o horário real da recuperação. Fechamentos manuais existentes são preservados e não são duplicados.
- O fechamento preserva intervalo, responsável, data/hora, fuso America/Bahia, observação, indicadores, estoque e registros detalhados: documentos, itens, movimentos, pagamentos, alocações e contas.
- Todas as compras, vendas, despesas, perdas, recebimentos e pagamentos nas datas fechadas ficam bloqueados, inclusive por requisições diretas à API ou outros acessos à mesma empresa.
- O fechamento e os lançamentos compartilham um bloqueio transacional. Uma operação concorrente entra inteira no snapshot se confirmar antes; se chegar depois, é recusada. O próximo dia fora do intervalo fechado fica aberto automaticamente.
- Datas futuras e intervalos sobrepostos são rejeitados. Não existe edição, exclusão ou reabertura de fechamentos. Triggers rejeitam UPDATE/DELETE no MySQL.
- **Fechamentos preservados** permite visualizar os registros e baixar o CSV completo do registro preservado. Mudanças nos cadastros e pagamentos em dias seguintes não recalculam o snapshot.
- Cadastros podem ser mantidos após o fechamento; isso não altera os registros preservados. O bloqueio é sobre lançamentos financeiros e de estoque.
- O snapshot é um registro interno de conferência e arquivo. Não é emissão de nota fiscal, assinatura digital ou carimbo de tempo certificado. Preserve backups e o arquivo original com seu hash.

O Compose habilita `log_bin_trust_function_creators=1` no MySQL do projeto para o Flyway criar os triggers sem conceder SUPER à aplicação. Um MySQL externo precisa permitir a criação desses triggers ao usuário de migração.

Para testar especificamente a automação com relógio controlado, Java 21, Maven e Docker Desktop, execute `./scripts/Test-AutomaticClosing.ps1`. O script cria um MySQL de teste novo na porta 13307, simula o horário de corte, recuperação e concorrência, encerra os contêineres e preserva o volume de teste. Ele não usa a base operacional. O teste é optativo e fica desabilitado no build normal; a automação do sistema fica habilitada por padrão.

## Correção de lançamentos

Na lista de compras, vendas, despesas, pagamentos ou perdas, localize o registro e clique em **Cancelar**. A mesma janela mostra os efeitos, o valor do estorno automático e o campo de motivo. Clique em **Confirmar cancelamento** para concluir. O ajuste entra na data atual, que precisa estar aberta.

Cancelar uma compra, venda ou despesa estorna automaticamente os valores já pagos ou recebidos e cancela o saldo pendente. Se um pagamento abranger outras contas, somente a parte do documento cancelado é estornada. O registro financeiro mostra o valor estornado e permite cancelar separadamente apenas o valor restante. Quando houver movimentos de estoque posteriores, a janela ainda orienta a sequência necessária para preservar o custo médio.

Para registrar os dados corretos depois de cancelar, clique em **Registrar dados corretos**. O formulário abre na tela de origem e o vínculo é feito automaticamente ao salvar. Para pagamentos, selecione a conta no Financeiro. A criação e o vínculo são confirmados juntos. Em **Resultados → Correções**, consulte o histórico e retome esse fluxo pelo botão **Ver cancelamento**. Esta versão trata erros de registro; devoluções reais de mercadoria e reembolsos ainda exigem um fluxo próprio.

Em **Compras** e **Vendas**, selecione o período para ver valores e quilos de todas as páginas e do filtro de busca. Os cartões mostram os valores registrados, estornos e total líquido. Um estorno de documento antigo entra na data da correção, mesmo que o original esteja fora do intervalo da lista. O dashboard também apresenta **Compras no período**, em reais e kg.

O teste optativo `./scripts/Test-Corrections.ps1` usa Java 21, Maven e um MySQL isolado na porta 13307 para conferir correções, períodos históricos, pagamentos, concorrência e rollback. O volume de teste é preservado ao encerrar.

## Stack e estrutura

- Java 21, Spring Boot 3.5.16, WebFlux, Spring Data R2DBC e MySQL 8.4/InnoDB.
- Flyway 11.20.3 via JDBC somente na inicialização. Requisições usam R2DBC e transações reativas.
- React 19, TypeScript e Vite 8. Componentes próprios em HTML/CSS, com foco, contraste, formulários semânticos e navegação móvel.
- Sessão no servidor, cookie HttpOnly/SameSite, CSRF obrigatório e senha BCrypt. Nenhuma senha ou token de sessão é salvo no localStorage.
- Nginx serve o front-end e encaminha `/api` ao back-end, mantendo a mesma origem.

```text
backend/src/main/java/br/com/camarao/
  auth/       autenticação e sessão
  catalog/    clientes, fornecedores e produtos
  trade/      compras e vendas
  stock/      custo médio, movimentos e perdas
  finance/    obrigações, recebimentos e pagamentos
  report/     resultado e posições históricas
  closing/    bloqueio de períodos, snapshots e integridade
  shared/     SQL, validações, erros e idempotência
backend/src/main/resources/db/migration/  migrações versionadas
frontend/src/                            telas e componentes
scripts/                                 inicialização e testes
docs/                                    arquitetura, API e validação
```

## Desenvolvimento fora dos containers

Requer JDK 21 e Node 22.12 ou superior. O Node 20.13.1 detectado inicialmente nesta máquina não atende à versão escolhida do Vite. O ambiente Docker evita precisar atualizar a instalação global.

Configure `JAVA_HOME` para o JDK 21 no terminal de desenvolvimento. Não é necessário instalar Maven: o projeto inclui Maven Wrapper.

```powershell
docker compose -f compose.yaml -f compose.dev.yaml up -d mysql
```

Na pasta `backend`, defina as variáveis de ambiente a partir de `.env` (sem imprimir as senhas), e execute:

```powershell
$env:DB_HOST='localhost'
$env:DB_PORT='3307'
$env:DB_NAME='camarao'
$env:DB_USER='camarao'
# Defina DB_PASSWORD e APP_ADMIN_PASSWORD com os valores de .env.
./mvnw.cmd spring-boot:run
```

Na pasta `frontend`:

```powershell
npm ci
npm run dev
```

O Vite encaminha `/api` para `localhost:8080`. Ao alternar para a execução completa em Docker, pare o Java e o Vite locais para liberar as portas.

## Testes

Testes de cálculo do back-end:

```powershell
cd backend
./mvnw.cmd verify
```

Build do front-end:

```powershell
cd frontend
npm ci
npm run build
```

Teste de integração HTTP/MySQL em projeto Docker separado:

```powershell
$testProject="camarao-gestao-test-$(Get-Date -Format yyyyMMddHHmmss)"
docker compose -p $testProject -f compose.yaml -f compose.test.yaml up -d --build
# Aguarde o back-end iniciar; consulte os logs se necessário.
node scripts/integration.mjs
# Opcional: execute tests/browser.mjs agora, antes de fechar o dia.
node scripts/discount-pagination-integration.mjs
# Opcional: execute tests/discount-pagination.browser.mjs após a massa acima.
node scripts/closing-integration.mjs
# Opcional: execute tests/closing.browser.mjs após fechar o dia.
docker compose -p $testProject -f compose.yaml -f compose.test.yaml down
```

O teste exige Node 22 e um **banco de teste novo**, sem lançamentos anteriores: ele valida totais exatos e cria dados fictícios. Usa `localhost:18080`, banco `camarao_test` e volume próprio do projeto de teste. O nome com data e hora permite repetir com uma base nova. Não aponte o teste para a base operacional. Não há limpeza automática de volume.

Teste de navegador no Windows com Microsoft Edge instalado, após o teste HTTP e com os containers de teste ainda em execução:

```powershell
cd tests
npm ci
node browser.mjs
# Após scripts/discount-pagination-integration.mjs e antes de fechar o dia:
node discount-pagination.browser.mjs
# Após executar scripts/closing-integration.mjs:
node closing.browser.mjs
```

O navegador de teste é separado do seu perfil pessoal. O primeiro teste valida cadastros, compras com/sem fornecedor, pendências, venda parcial, recebimento e nove telas em 390px. O segundo valida o fechamento pela interface, leitura/download do snapshot e bloqueio visual dos lançamentos. As capturas são salvas localmente em `docs/previews/`, usam exclusivamente dados fictícios e não são versionadas.

## Limites desta entrega

A tela de entrada oferece **Lembrar meu login por 30 dias**, desmarcada por padrão. Em um dispositivo pessoal, permite voltar ao sistema sem digitar a senha, inclusive após reiniciar o navegador ou o backend. **Sair do sistema** revoga esse acesso no dispositivo; trocar ou redefinir a senha invalida todos os acessos antigos. Em produção, configure `APP_PUBLIC_URL` com HTTPS para que o cookie persistente seja Secure. A migração V8 guarda somente hashes dos tokens no MySQL.

- Um administrador configurado por ambiente; cadastro de usuários e permissões distintas ainda pendente.
- Uma conta financeira operacional; sem saldo inicial, aportes, retiradas ou conciliação bancária. O relatório identifica o saldo como saldo dos lançamentos registrados.
- Datas operacionais são as do registro, em UTC, com relatório por dia no fuso America/Bahia; sem lançamentos retroativos nesta versão.
- Sem rascunhos, pedidos futuros, reserva, devoluções reais, juros, crédito antecipado, emissão fiscal ou integração de pagamento.
- Sem reabertura de períodos fechados; correções futuras precisarão de ajustes auditados que preservem os snapshots existentes.
- Sem lotes/validade e sem frete de aquisição rateado. O custo considera os totais arredondados dos itens comprados. Registre despesas operacionais separadamente, evitando contar um mesmo gasto duas vezes.
- Ambiente de desenvolvimento local. Acesso por celular físico em rede e publicação exigem configuração de rede, HTTPS, cookies Secure e revisão operacional; não basta expor o MySQL.

Veja [Arquitetura](docs/ARQUITETURA.md), [API](docs/API.md) e [Validação](docs/VALIDACAO.md).
