let socketServer;
export const setSocketServer = (io) => { socketServer = io; };
export const emitExamEvent = (examId, event, payload) => socketServer?.to(`exam:${examId}`).emit(event, payload);
