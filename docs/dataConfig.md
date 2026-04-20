# 数据库配置

项目采用的数据库为Postgresql，数据库下载地址为：https://www.postgresql.org/download/

关于安装数据库后的一些配置

```database
# 修改端口号
vim /var/lib/pgsql/data/postgresql.conf  
port = '5432'

# 修改监听地址，根据需要进行修改
/var/lib/pgsql/data/postgresql.conf  
listen_addresses = '*'

# 增加白名单
vim /var/lib/pgsql/data/pg_hba.conf        
host    netops    netops_user     0.0.0.0/0   md5

# 查看用户
\du

# 增加数据库用户
ALTER USER netops_user WITH SUPERUSER;

#给予用户权限
ALTER USER netops_user WITH SUPERUSER;
```

关于数据库SQL语句的相关编写和基础语法可参考如下：

https://flask.palletsprojects.com/zh-cn/stable/tutorial/database/

https://stackoverflow.com/questions/54451673/how-to-close-db-with-flask-mongoengine?utm_source=chatgpt.com
