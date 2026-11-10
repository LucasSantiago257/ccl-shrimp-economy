# API inicial

JSON em `/api/v1`. Campos financeiros e quantidades podem ser enviados como strings decimais com ponto. IDs são números inteiros positivos.

## Paginação

GET de `/customers`, `/suppliers`, `/products`, `/sales`, `/purchases`, `/expenses`, `/titles`, `/settlements`, `/stock/movements` e `/closings` retorna um objeto paginado. Essa resposta substitui os arrays da versão inicial; a interface e os testes foram atualizados em conjunto.

Parâmetros comuns: `page` a partir de 1 (padrão 1), `size` entre 1 e 100 (padrão 20) e `q` de até 200 caracteres. Exemplo: `/customers?page=2&size=20&q=Maria`. `%`, `_` e `!` na busca são tratados como texto literal. Valores inválidos retornam 400.

Formato (itens abreviados):

```json
{"items":[{"id":1,"name":"Maria"}],"page":1,"size":20,"total":42,"totalPages":3,"hasNext":true,"hasPrevious":false,"summary":{}}
```

`total` é a quantidade de registros, não um valor financeiro. Uma página além da última retorna `items:[]`, mantendo a contagem real. A ordenação inclui o ID para desempate.

`summary` agrega todos os registros do filtro, não apenas a página: `balance` em clientes/fornecedores; `quantity` e `stock_value` em produtos; `total` em documentos/despesas; `amount`, `paid` e `outstanding` em títulos. Quando não há agregação específica, é `{}`. Contagem, resumo e página são consultados na mesma transação de leitura.

Relatórios, snapshots completos e itens de um documento continuam com seus formatos próprios, sem cortes por paginação.

Compras e vendas aceitam `from` e `to` inclusivos, opcionais em conjunto, para intervalos de até dez anos em America/Bahia. A lista contém documentos emitidos no período. Seu `summary` contém totais de todos os eventos do filtro, incluindo estornos na data da correção: `total`, `quantity`, `gross_total`, `discount_amount`, `registered_total`, `reversed_total` e `reversed_quantity`. Consulte [Correções](CORRECOES.md) para o fluxo, dependências e endpoints.

## Autenticação

1. GET `/api/auth/csrf`: retorna `token` e `header`, e inicia a sessão.
2. POST `/api/login`: formulário URL-encoded com `username`, `password` e `remember=true` opcional (padrão false); enviar cookie de sessão e o header CSRF retornado. Sucesso 204, falha 401.
3. GET `/api/auth/me`: retorna o usuário autenticado.
4. POST `/api/logout`: encerra a sessão; enviar CSRF.

Depois de autenticar, obtenha novamente o CSRF antes dos comandos. O navegador inclui o cookie HttpOnly automaticamente. Não usar Basic Auth.

Login aceita até 20 tentativas por origem em cada minuto UTC, incluindo tentativas bem-sucedidas. Exceder o limite retorna 429 com `Retry-After` em segundos. A contagem é atômica e compartilhada no MySQL, inclusive após reinícios e entre instâncias; guarda hash da origem e remove janelas antigas. Não é um bloqueio global da conta. Por padrão, usa o endereço da conexão e ignora cabeçalhos de origem. `APP_TRUST_LOGIN_PROXY=true` permite usar `X-Real-IP` somente em implantação cujo backend seja acessível exclusivamente por um proxy confiável que sobrescreva esse cabeçalho. O Compose habilita isso para seu Nginx e mantém o backend em loopback. A proteção continua exigindo CSRF.

## Idempotência dos cadastros

POST de `/api/v1/customers`, `/api/v1/suppliers` e `/api/v1/products` também exige `Idempotency-Key` de 16 a 64 caracteres (`A-Z`, `a-z`, `0-9`, `_`, `-`). Repetir a mesma chave, corpo, tipo de operação e usuário devolve o mesmo ID, inclusive com requisições concorrentes. Reutilizar a chave para outro conteúdo ou operação retorna 409. Cliente e fornecedor não passam a ter nome único; a garantia cobre o reenvio da mesma operação. O cadastro de produto e seu saldo inicial são atômicos.

Elementos nulos nas listas `items` e `allocations` são rejeitados antes da execução de vendas, compras e baixas. O fluxo de recriação também valida os elementos antes de gravar.

`remember=true` emite `MARE_REMEMBER`, cookie HttpOnly, SameSite=Lax, caminho `/api`, com validade fixa de 30 dias. Em HTTPS (APP_PUBLIC_URL ou conexão TLS direta), usa Secure. O banco guarda somente o SHA-256 do token aleatório de 256 bits e a versão da conta. Sem sessão, o token autentica cada requisição após verificar prazo e versão no banco; continua funcionando após reinício do backend. A sessão normal segue com 8 horas de inatividade e cookie de sessão. Não há armazenamento de senha/token em localStorage. Logout revoga o token daquele dispositivo e encerra sua sessão. Novo login sem a opção revoga o token anterior do dispositivo. Troca/reset de senha ou alteração do usuário revogam todos os acessos lembrados por versão; CSRF continua obrigatório. Após 30 dias é necessário informar a senha novamente.

## Perfil e recuperação

- GET `/api/auth/profile` retorna usuário, e-mail de recuperação e indicador de envio configurado.
- POST `/api/auth/password` recebe `currentPassword`, `password` e `confirmation`. Exige autenticação e CSRF. A senha é persistida no banco e a versão da conta é incrementada para revogar sessões antigas.
- POST `/api/auth/password/reset-request` exige CSRF e envia instruções exclusivamente ao FALLBACK_MAIL. O link usa token aleatório de 256 bits, hash no banco, validade de 30 minutos e uso único. Enquanto existir um link válido, pedidos repetidos preservam esse link.
- POST `/api/auth/password/reset` recebe `token`, `password` e `confirmation`, exige CSRF e revoga os acessos anteriores após concluir.

As senhas aceitam pelo menos 12 caracteres e até 72 bytes UTF-8 para BCrypt. Login, alteração, solicitação e confirmação de recuperação têm limites de tentativas. O envio sem SMTP configurado retorna 503. O token é entregue no fragmento da URL pública configurada e removido do endereço pelo cliente ao abrir o formulário.

## Cadastros

Produtos retornam `box_weight_kg` (padrão 15). PUT `/products/{id}/box-weight` recebe `{"boxWeightKg":"12.5"}`: valor positivo de 0,001 a 999999,999 kg, até três casas decimais. Exige sessão e CSRF. Muda somente a preferência de apresentação e de novos lançamentos; não movimenta estoque nem altera documentos históricos. Pode ser usado mesmo com o dia fechado.

Itens de POST `/purchases` e `/sales` podem incluir `boxCount` e `boxWeightKg`, obrigatoriamente juntos e positivos. `quantity` continua sendo o peso em kg e deve ser exatamente igual ao produto dos dois campos. Exemplo: `{"productId":1,"quantity":"30","unitPrice":"50","boxCount":"2","boxWeightKg":"15"}`. `unitPrice` continua em reais por kg. A conversão deve caber nos limites da quantidade, com no máximo três casas decimais em kg, sem arredondamento. O servidor valida a igualdade e guarda os metadados na mesma transação. GET dos itens retorna `box_count` e `box_weight_kg`; itens antigos e registros diretos em kg têm ambos nulos. Omissão desses campos mantém a serialização anterior para reenvios idempotentes de operações em kg. Perdas e saldo inicial recebem apenas `quantity` já convertido para kg. Veja [regras de caixas](CAIXAS.md).

O código do produto é interno e não aparece no formulário. POST `/products` aceita `code` omitido, nulo ou em branco: o servidor usa as três primeiras letras do nome, em maiúsculas e sem acentos, seguidas da sequência por prefixo (`CAM-001`, `CAM-002`…). Considera códigos existentes e não reutiliza números já reservados. Nomes curtos usam as letras disponíveis; sem letras, o prefixo é `PRO`. A sequência continua após 999. A geração e o cadastro são atômicos, inclusive em requisições simultâneas. A API mantém compatibilidade com códigos manuais; PUT sem código preserva o identificador atual, mesmo ao renomear o produto.

- GET/POST `/customers` e `/suppliers`; PUT `/{id}` para editar/inativar.
- GET aceita `q` (nome, telefone ou documento) e `activeOnly=true`.
- GET/POST `/products`; PUT `/products/{id}`.
- Produtos aceitam `q` por nome/código, `activeOnly=true` e `inStockOnly=true`.

Cliente/fornecedor:

```json
{"name":"Maria","phone":"71999990000","document":"","notes":"","active":true}
```

Produto:

```json
{"code":"CAM-002","name":"Camarão grande","suggestedPrice":"60.00","minimumStock":"5.000","active":true}
```

## Operações

POSTs abaixo exigem `Idempotency-Key` de 16 a 64 caracteres alfanuméricos, `_` ou `-` (UUID recomendado). Repetir o mesmo corpo com a mesma chave não duplica o lançamento. Uma mesma chave não pode representar dois comandos diferentes.

GET/POST `/purchases` ou `/sales`. Exemplo de venda:

```json
{
  "partyId": 1,
  "items": [{"productId":1,"quantity":"10.000","unitPrice":"50.00"}],
  "discountAmount":"50.00",
  "paidAmount":"200.00",
  "method":"PIX",
  "dueDate":"2026-10-30"
}
```

`partyId` é fornecedor na compra e cliente na venda. Nas compras pode ser omitido ou enviado como `null`; nas vendas continua obrigatório. `paidAmount=0` cria dívida integral; igual ao total quita imediatamente. A propriedade opcional `payInFull=true` solicita quitação do total exato calculado no servidor, substituindo `paidAmount`; a interface utiliza essa opção para pagamento integral sem depender da estimativa numérica do navegador. Itens não podem repetir produto. Total mínimo de um centavo por item. Métodos: CASH, PIX, TRANSFER ou CARD. Retorno `{"id":1}`. GET `/{sales|purchases}/{id}/items` mostra os itens.

`discountAmount` é opcional nas vendas (padrão zero) e deve ter no máximo duas casas decimais. `gross_total` é a soma dos itens; `discount_amount` é o desconto do documento; `total` é o valor líquido. `paidAmount` não pode ultrapassar esse líquido e `payInFull` quita o líquido exato. O exemplo acima gera venda de R$ 450, pagamento de R$ 200 e dívida de R$ 250.

Desconto integral é permitido: gera venda de total zero com custo e movimento de estoque, mas sem título ou recebimento. Nas compras omita o desconto ou envie zero. Os itens preservam seus subtotais brutos, sem rateio do desconto global. O desconto foi introduzido no schemaVersion 2; snapshots novos usam a versão 4 e os anteriores permanecem íntegros.

POST `/settlements` permite quitar parcialmente ou distribuir um pagamento entre títulos da mesma pessoa/natureza:

```json
{"method":"PIX","allocations":[{"titleId":1,"amount":"100.00"},{"titleId":2,"amount":"50.00"}]}
```

GET `/titles?nature=RECEIVABLE` ou `PAYABLE`; filtros opcionais `customerId`, `openOnly=true` e `purchasesOnly=true`. Cada título retorna `amount`, `paid` e `outstanding`. Compras sem fornecedor usam uma identificação pelo número da compra. GET `/settlements?customerId=1` mostra recebimentos do cliente. Datas dos pagamentos são geradas pelo servidor.

GET/POST `/expenses`:

```json
{"description":"Gelo","category":"Conservação","amount":"100.00","paidAmount":"50.00","method":"CASH","dueDate":"2026-10-30"}
```

GET `/stock/movements?productId=1`. POST `/stock/losses`:

```json
{"productId":1,"quantity":"0.500","reason":"Descarte por conservação"}
```

GET `/reports/result?from=2026-10-01&to=2026-10-31`: `metrics` com subtotal das vendas (`gross_revenue`), descontos (`discounts`), receita líquida (`revenue`), CMV, resultado, despesas, perdas, caixa e contas abertas; `stock` com posições históricas por produto. Datas inclusivas e período de até dez anos.

`receivables` representa o saldo de vendas a receber; `purchase_payables` representa apenas compras ainda a pagar. `payables` inclui também despesas. Esses totais são calculados sobre todos os títulos, independentemente do limite das listas da interface.

## Dashboards

GET `/reports/dashboard?from=AAAA-MM-DD&to=AAAA-MM-DD` retorna `from`, `to`, `timezone`, `grouping`, `metrics` (mesmos indicadores do fechamento), `stock_kg`, `composition` e `series`. Em `composition`, `sales_total`, `sales_paid`, `purchases_total` e `purchases_paid` consideram documentos do intervalo e pagamentos até o fim do último dia. Cada ponto da série traz suas datas inclusivas e os valores de receita, resultado, caixa e quilos. O intervalo aceita de 1 a 366 dias. O agrupamento é `day` até 31 dias, `week` até 90 e `month` acima disso, respeitando America/Bahia.

## Fechamentos

- GET `/closings`: metadados paginados e pesquisáveis dos fechamentos, sem recalcular snapshots.
- GET `/closings/status`: data operacional atual, indicador `closed` e ID do fechamento quando o snapshot já estiver preservado. A partir das 23h59 (America/Bahia), retorna `closed=true` mesmo se a captura ainda estiver pendente; nesse caso, informa `automaticClosingPending=true` sem `closureId`.
- POST `/closings`, com CSRF e `Idempotency-Key`:

```json
{"from":"2026-10-28","to":"2026-10-28","note":"Conferência do dia"}
```

Datas são inclusivas no fuso America/Bahia. Pode fechar hoje ou datas anteriores, por até dez anos, desde que não haja sobreposição. Fechar hoje impede novos lançamentos no mesmo dia para toda a empresa. Amanhã, se não estiver fechado, volta a ser possível lançar. Não existe reabertura.

O servidor fecha cada dia automaticamente às 23h59 nesse fuso, com autor `Sistema (automático)`. Nenhum comando HTTP é necessário. Novos lançamentos são recusados a partir desse horário, independentemente do progresso da captura. Após reiniciar, o servidor recupera dias pendentes desde a ativação; fechamentos manuais existentes são mantidos. A API de fechamento manual continua disponível para antecipar o encerramento ou fechar outros intervalos.

- GET `/closings/{id}`: `{metadata,snapshot}`. Inclui intervalo, autor, horário, versão, SHA-256 e conteúdo congelado (relatório e registros).
- GET `/closings/{id}/snapshot`: exporta CSV completo em UTF-8 com BOM, delimitador ponto e vírgula e colunas Seção, Registro, Campo e Valor. O conteúdo é gerado a partir do snapshot cuja integridade é verificada antes da exportação. O SHA-256 exibido identifica o registro interno preservado.
- Leituras verificam a integridade. Não existem PUT/PATCH/DELETE para snapshots.

Compras, vendas, pagamentos, despesas e perdas tentados em dia fechado retornam 409. A checagem e as gravações compartilham a transação do bloqueio, cobrindo concorrência. Reenvio idempotente de um comando que já havia sido concluído retorna seu ID original, sem novo lançamento.

## Erros

- 400: formato inválido ou validação de campos.
- 401: sem autenticação/sessão expirada.
- 403: CSRF ausente ou inválido.
- 404: cadastro ou título não encontrado.
- 409: estoque insuficiente, chave reutilizada incorretamente, duplicidade ou conflito concorrente.
- 422: regra de negócio violada, por exemplo pagamento acima da dívida.

Erros de validação e domínio retornam `message` e, quando aplicável, `errors`. O cliente deve recarregar os dados em conflitos e manter a chave quando reenviar um comando idêntico após falha de rede.

## Saldo inicial e exportação compacta

Consulte os contratos, os limites de período e as regras de implantação em [Saldo inicial e exportação compacta](SALDOS_E_EXPORTACAO.md). O resumo é obtido por GET /api/v1/reports/export e a configuração por /api/v1/opening-balances. Os novos snapshots usam schemaVersion 4.
