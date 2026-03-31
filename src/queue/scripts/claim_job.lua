local now = ARGV[1]
local processingKey = KEYS[2]
local pendingKey = KEYS[1]

local jobs = redis.call('ZRANGEBYSCORE', pendingKey, '-inf', now, 'LIMIT', 0, 1)

if #jobs == 0 then
  return nil
end

local jobId = jobs[1]

redis.call('ZREM', pendingKey, jobId)
redis.call('ZADD', processingKey, now, jobId)

return jobId