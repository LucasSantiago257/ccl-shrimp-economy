# API inicial

JSON em `/api/v1`. Campos financeiros e quantidades podem ser enviados como strings decimais com ponto. Listas são limitadas conforme descrito no README. IDs são números inteiros positivos.

## Autenticação

1. GET `/api/auth/csrf`: retorna `token` e `header`, e inicia a sessão.
2. POST `/api/login`: formulário URL-encoded com `username` e `password`; enviar cookie de sessão e o header CSRF retornado. Sucesso 204, falha 401.
3. GET `/api/auth/me`: retorna o usuário autenticado.
4. POST `/api/logout`: encerra a sessão; enviar CSRF.

Depois de autenticar, obtenha novamente o CSRF antes dos comandos. O navegador inclui o cookie HttpOnly automaticamente. Não usar Basic Auth.

## Cadastros

- GET/POST `/customers` e `/suppliers`; PUT `/{id}` para editar/inativar.
- GET aceita `?q=nome` (busca por nome, limite 200).
- GET/POST `/products`; PUT `/products/{id}`.

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

GET/POST `/purchases` ou `/sales`:

```json
{
  "partyId": 1,
  "items": [{"productId":1,"quantity":"10.000","unitPrice":"50.00"}],
  "paidAmount":"200.00",
  "method":"PIX",
  "dueDate":"2026-10-30"
}
```

`partyId` é fornecedor na compra e cliente na venda. Nas compras pode ser omitido ou enviado como `null`; nas vendas continua obrigatório. `paidAmount=0` cria dívida integral; igual ao total quita imediatamente. A propriedade opcional `payInFull=true` solicita quitação do total exato calculado no servidor, substituindo `paidAmount`; a interface utiliza essa opção para pagamento integral sem depender da estimativa numérica do navegador. Itens não podem repetir produto. Total mínimo de um centavo por item. Métodos: CASH, PIX, TRANSFER ou CARD. Retorno `{"id":1}`. GET `/{sales|purchases}/{id}/items` mostra os itens.

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

GET `/reports/result?from=2026-10-01&to=2026-10-31`: `metrics` com receita, CMV, resultado, despesas, perdas, caixa e contas abertas; `stock` com posições históricas por produto. Datas inclusivas e período de até dez anos.

`receivables` representa o saldo de vendas a receber; `purchase_payables` representa apenas compras ainda a pagar. `payables` inclui também despesas. Esses totais são calculados sobre todos os títulos, independentemente do limite das listas da interface.

## Fechamentos

- GET `/closings`: metadados de todos os fechamentos, sem recalcular snapshots.
- GET `/closings/status`: data operacional atual, indicador `closed` e ID do fechamento quando o dia estiver bloqueado.
- POST `/closings`, com CSRF e `Idempotency-Key`:

```json
{"from":"2026-10-28","to":"2026-10-28","note":"Conferência do dia"}
```

Datas são inclusivas no fuso America/Bahia. Pode fechar hoje ou datas anteriores, por até dez anos, desde que não haja sobreposição. Fechar hoje impede novos lançamentos no mesmo dia para toda a empresa. Amanhã, se não estiver fechado, volta a ser possível lançar. Não existe reabertura.

- GET `/closings/{id}`: `{metadata,snapshot}`. Inclui intervalo, autor, horário, versão, SHA-256 e conteúdo congelado (relatório e registros).
- GET `/closings/{id}/snapshot`: download do JSON original, com `Content-Disposition: attachment`. O SHA-256 é calculado sobre os bytes UTF-8 desse arquivo e pode ser comparado ao metadado `snapshot_sha256`.
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
