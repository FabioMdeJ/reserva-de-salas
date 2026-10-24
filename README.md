# ReservaFácil

Aplicação web para apresentar salas e apoiar a futura reserva de espaços por hora. O projeto está em desenvolvimento: a interface lista salas ativas, e a API permite consultar e cadastrar salas e consultar horários disponíveis. O fluxo completo de reservas ainda está planejado.

## Status do projeto

**Implementado/configurado**
- Interface local em Next.js para listar salas ativas e exibir descrição e valor por hora.
- API para listar e cadastrar salas.
- API para consultar horários disponíveis conforme o expediente e reservas existentes no banco.
- Fluxo de reserva de visitantes com validação no servidor, bloqueio de conflitos simultâneos e expiração após 15 minutos.
- Datas e horários de reserva tratados no fuso `America/Sao_Paulo`.
- PostgreSQL e Prisma configurados, com schema e migração inicial no projeto.

**Ainda não implementado**
- Autenticação, autorização e área administrativa.
- Pagamentos e integração com Asaas, incluindo processamento de webhook.
- Envio de e-mails.

## Tecnologias

- Next.js 16, React 19 e TypeScript
- Tailwind CSS 4
- PostgreSQL
- Prisma 7 com adaptador `pg`

## Pré-requisitos

- Node.js e npm
- PostgreSQL acessível localmente ou por uma URL de conexão

## Configuração local

1. Instale as dependências:

   ```bash
   npm install
   ```

2. Crie um arquivo `.env` na raiz do projeto e configure `DATABASE_URL` com os dados do seu PostgreSQL. Exemplo com valores fictícios:

   ```dotenv
   DATABASE_URL="postgresql://USUARIO:SENHA@localhost:5432/reservafacil?schema=public"
   ```

   Crie antes o banco `reservafacil` no PostgreSQL, se ele ainda não existir. Substitua usuário, senha e demais parâmetros pelos valores do seu ambiente. **Nunca faça commit do `.env` nem de credenciais reais.**

3. Aplique as migrações do banco:

   ```bash
   npx prisma migrate dev
   ```

4. Gere o Prisma Client:

   ```bash
   npx prisma generate
   ```

5. Inicie a aplicação:

   ```bash
   npm run dev
   ```

6. Acesse [http://localhost:3000](http://localhost:3000).

## Endpoints disponíveis

### Salas

- `GET /api/salas` — lista as salas.
- `POST /api/salas` — cadastra uma sala. Exemplo de corpo JSON:

  ```json
  {
    "nome": "Sala de reunião",
    "descricao": "Espaço para reuniões e atendimentos.",
    "valorHora": 80
  }
  ```

### Disponibilidade

- `GET /api/disponibilidade?salaId=<id>&data=AAAA-MM-DD` — consulta horários disponíveis para uma sala e data. A consulta considera reservas pendentes ou confirmadas existentes no banco.
- `POST /api/reservas` — cria uma reserva pendente para visitante. Corpo JSON: `salaId`, `data` (`AAAA-MM-DD`), `horaInicio` (`HH:mm`), `nome`, `email` e `telefone` opcional. Uma reserva pendente bloqueia o horário por 15 minutos.

Datas, horários exibidos e validação de horários futuros usam `America/Sao_Paulo`. A disponibilidade segue o expediente definido no projeto: segunda a sexta, das 08h às 18h; sábado, das 08h às 12h; domingo, fechado. Os horários são gerados em intervalos de uma hora.

## Próximas etapas

1. Adicionar autenticação, autorização e ferramentas administrativas para gerenciar salas e reservas.
2. Integrar pagamentos com Asaas e validar notificações recebidas pelo webhook.
3. Adicionar envio de e-mails.
