import * as moment from "moment";

// Función para obtener la fecha actual en UTC
export const getCurrentUTCDate = (): Date => {
    return moment.utc().subtract(5, 'hours').toDate();
}