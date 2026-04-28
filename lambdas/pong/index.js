exports.handler = async (event = {}) => {
  const body = {
    ok: true,
    message: 'pong',
    received: event,
    timestamp: new Date().toISOString(),
  };

  return {
    statusCode: 200,
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  };
};
