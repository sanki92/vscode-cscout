#ifndef CALC_H
#define CALC_H

#define MAX_BUF 256
#define EPSILON 1e-9
#define DEBUG_MODE 0

typedef enum {
    OP_ADD,
    OP_SUB,
    OP_MUL,
    OP_DIV
} calc_op_t;

typedef struct {
    double value;
    int error_code;
} CalcResult;

double calc_add(double a, double b);
double calc_sub(double a, double b);
double calc_mul(double a, double b);
double calc_div(double a, double b);

#endif /* CALC_H */
