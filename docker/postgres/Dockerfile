FROM postgres:16-alpine AS builder

RUN apk add --no-cache git make gcc musl-dev postgresql16-dev \
    && git clone --depth 1 https://github.com/fboulnois/pg_uuidv7.git /tmp/pg_uuidv7 \
    && cd /tmp/pg_uuidv7 && make LLVM_BITCODE_GENERATION= || true \
    && test -f /tmp/pg_uuidv7/pg_uuidv7.so

FROM postgres:16-alpine

COPY --from=builder /tmp/pg_uuidv7/pg_uuidv7.so /usr/local/lib/postgresql/
COPY --from=builder /tmp/pg_uuidv7/pg_uuidv7.control /usr/local/share/postgresql/extension/
COPY --from=builder /tmp/pg_uuidv7/sql/pg_uuidv7--1.6.sql /usr/local/share/postgresql/extension/

# pg_uuidv7 control expects default_version matching the SQL file
RUN cp /usr/local/share/postgresql/extension/pg_uuidv7--1.6.sql \
       /usr/local/share/postgresql/extension/pg_uuidv7--1.7.sql
