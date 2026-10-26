# Reserva_Salas

Aplicação web desenvolvida com Next.js para consulta de salas e criação de reservas por hora. O sistema permite que visitantes consultem a disponibilidade e solicitem uma reserva sem precisar criar uma conta.

O projeto está em desenvolvimento, com interface web, APIs para gerenciamento de salas, consulta de disponibilidade e criação de reservas de visitantes.

## Status do projeto

### Implementado

- Interface em Next.js para listar salas ativas e exibir descrição e valor por hora.
- API para consultar e cadastrar salas.
- API para consultar horários disponíveis, considerando o expediente e as reservas existentes no banco de dados.
- Fluxo de reservas de visitantes com validação no servidor.
- Prevenção de conflitos entre reservas simultâneas.
- Reservas pendentes com expiração após 15 minutos.
- Tratamento de datas e horários no fuso `America/Sao_Paulo`.
- Persistência de dados com PostgreSQL e Prisma ORM.
- Migrações do banco de dados versionadas no projeto.

### Ainda não implementado

- Autenticação e autorização completas.
- Área administrativa para gerenciamento de salas e reservas.
- Pagamentos reais e integração com o Asaas, incluindo processamento de webhooks.
- Envio de e-mails.

## Tecnologias utilizadas

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS 4
- PostgreSQL
- Prisma 7 com adaptador `pg`

## Pré-requisitos

Antes de executar o projeto, instale:

- Node.js e npm.
- PostgreSQL.
- Git, para clonar o repositório.

## Configuração local

### 1. Clone o repositório

```bash
git clone https://github.com/FabioMdeJ/reserva-de-salas.git
cd reserva-de-salas
```

### 2. Instale as dependências

```bash
npm install
```

### 3. Configure as variáveis de ambiente

Crie um arquivo `.env` na raiz do projeto e configure a variável `DATABASE_URL` com os dados do seu PostgreSQL.

Exemplo com valores fictícios:

```dotenv
DATABASE_URL="postgresql://USUARIO:SUA_SENHA_LOCAL@localhost:5432/reserva_salas?schema=public"
```

Substitua `USUARIO` e `SUA_SENHA_LOCAL` pelas credenciais do seu ambiente.

Crie o banco de dados `reserva_salas` no PostgreSQL, caso ainda não exista.

**Importante:** nunca publique o arquivo `.env` nem inclua senhas, tokens ou outras credenciais reais no Git.

### 4. Aplique as migrações do banco de dados

Com o PostgreSQL em execução e a variável `DATABASE_URL` configurada, execute:

```bash
npx prisma migrate dev
```

Esse comando aplica as migrações pendentes no banco configurado. Em caso de dúvida sobre o ambiente ou sobre o estado das migrações, verifique a configuração antes de executar.

### 5. Gere o Prisma Client

```bash
npx prisma generate
```

### 6. Inicie a aplicação

```bash
npm run dev
```

### 7. Acesse o sistema

Abra o navegador em:

[http://localhost:3000](http://localhost:3000)

## Endpoints da API

### Salas

- `GET /api/salas` — consulta as salas disponíveis.
- `POST /api/salas` — cadastra uma sala.

Exemplo de corpo JSON para cadastro:

```json
{
  "nome": "Sala de reunião",
  "descricao": "Espaço para reuniões e atendimentos.",
  "valorHora": 80
}
```

### Disponibilidade

- `GET /api/disponibilidade?salaId=<id>&data=AAAA-MM-DD` — consulta os horários disponíveis para uma sala em determinada data.

A consulta considera as reservas pendentes ainda válidas e as reservas confirmadas existentes no banco de dados.

### Reservas

- `POST /api/reservas` — cria uma reserva pendente para um visitante.

Os dados da solicitação incluem:

- `salaId`: identificador da sala.
- `data`: data da reserva, no formato `AAAA-MM-DD`.
- `horaInicio`: horário de início, no formato `HH:mm`.
- `nome`: nome do visitante.
- `email`: e-mail do visitante.
- `telefone`: telefone do visitante, opcional.

Uma reserva pendente bloqueia o horário por 15 minutos. Após esse período, ela pode expirar e deixar de bloquear a disponibilidade, conforme as regras implementadas no sistema.

## Regras de funcionamento

O sistema utiliza o fuso horário `America/Sao_Paulo` para tratar as datas, os horários e a validação de horários futuros.

O expediente configurado é:

- **Segunda a sexta-feira:** das 08h às 18h.
- **Sábado:** das 08h às 12h.
- **Domingo:** sem expediente.

A disponibilidade é organizada em intervalos de uma hora.

## Próximas etapas

1. Implementar autenticação, autorização e uma área administrativa para gerenciar salas e reservas.
2. Integrar pagamentos com o Asaas e implementar a validação de notificações por webhook.
3. Implementar o envio de e-mails para notificações relacionadas às reservas.
4. Ampliar os testes integrados, incluindo testes de concorrência contra o PostgreSQL.
5. Revisar a configuração e o estado das migrações nos diferentes ambientes.

## Segurança

- Não versionar arquivos `.env`.
- Não publicar credenciais reais no repositório.
- Utilizar variáveis de ambiente para configurar o acesso ao banco de dados.
- Verificar o estado das migrações antes de executar comandos que alterem o banco.
