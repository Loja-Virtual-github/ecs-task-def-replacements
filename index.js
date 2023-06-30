const core = require('@actions/core')
const {
  ECSClient,
  DescribeTaskDefinitionCommand,
  DescribeServicesCommand,
} = require('@aws-sdk/client-ecs')
const { merge, head, omit } = require('lodash')
const tmp = require('tmp')
const fs = require('fs')

const IGNORED_TASK_DEFINITION_ATTRIBUTES = [
  'compatibilities',
  'taskDefinitionArn',
  'requiresAttributes',
  'revision',
  'status',
  'registeredAt',
  'deregisteredAt',
  'registeredBy'
]

const getTaskDefinition = async ({
  taskDefinition,
  client,
}) => {
  const command = new DescribeTaskDefinitionCommand({
    taskDefinition,
    client
  })

  try {
    const { taskDefinition } = await client.send(command)
    return taskDefinition
  } catch (error) {
    core.setFailed(error.message)
  }
}

const getECSService = async ({
  cluster,
  service,
  client
}) => {
  const command = new DescribeServicesCommand({
    services: [service],
    cluster
  })

  const { services } = await client.send(command)
  if (services.length < 1) {
    throw new ReferenceError('Service not found')
  }
  return services
}


async function run() {
  const aws_region = core.getInput('region')
  const cluster = core.getInput('cluster-name')
  const service = core.getInput('service-name')
  const task = core.getInput('task-name')

  console.log('Start client with region', aws_region)
  const client = new ECSClient({ region: aws_region })

  try {
    if (service !== '') {
      const services = await getECSService({
        cluster,
        service,
        client
      })
      const { taskDefinition } = head(services)
      console.log('Task definition from services', taskDefinition)
      const taskDef = await getTaskDefinition({
        taskDefinition,
        client,
      })

      console.log('Task definition from task', taskDef)

      const replacements = core.getInput('replacements') || '{}'
      const taskDefMerged = merge(taskDef, JSON.parse(replacements))
      console.log('Task definition merged', taskDefMerged)

      const newTaskDef = omit(taskDefMerged, IGNORED_TASK_DEFINITION_ATTRIBUTES)
      console.log('Task definition merged and cleaned', newTaskDef)

      // create a a file for task def
      const taskDefFile = tmp.fileSync({
        tmpdir: process.env.RUNNER_TEMP,
        prefix: 'task-definition-',
        postfix: '.json',
        keep: true,
        discardDescriptor: true
      })

      fs.writeFileSync(taskDefFile.name, JSON.stringify(newTaskDef))
      core.setOutput('taskDef', taskDefFile.name)
    } else {
      const taskDef = await getTaskDefinition({
        taskDefinition: task,
        client,
      })

      console.log('Task definition from task', taskDef)

      const replacements = core.getInput('replacements') || '{}'
      const taskDefMerged = merge(taskDef, JSON.parse(replacements))

      const newTaskDef = omit(taskDefMerged, IGNORED_TASK_DEFINITION_ATTRIBUTES)

      console.dir(newTaskDef)

      const taskDefFile = tmp.fileSync({
        tmpdir: process.env.RUNNER_TEMP,
        prefix: 'task-definition-',
        postfix: '.json',
        keep: true,
        discardDescriptor: true
      })

      fs.writeFileSync(taskDefFile.name, JSON.stringify(newTaskDef))
      core.setOutput('taskDef', taskDefFile.name)
    }
  } catch (error) {
    core.setFailed(error.message)
  }
}

run()
